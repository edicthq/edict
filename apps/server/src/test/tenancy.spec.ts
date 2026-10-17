import { describe, expect, it, onTestFinished } from "vitest";
import { sql } from "drizzle-orm";
import {
  createDatabase,
  createPool,
  emit,
  enterOrg,
  events,
  inScope,
  members,
  migrateToLatest,
  organizations,
  teams,
} from "@edicthq/db";
import { createTestDatabase } from "./server.js";

// Drizzle wraps the Postgres error and keeps it as the cause.
function pgError(message: RegExp) {
  return { cause: { message: expect.stringMatching(message) } };
}

// Row-level security is the backstop under the data-access layer (ADR 0006):
// even a query that forgets its org_id filter sees one organization only.
async function twoOrgs() {
  const database = await createTestDatabase();
  const pool = createPool(database.url);
  onTestFinished(() => pool.end());
  await migrateToLatest(pool);
  const db = createDatabase(pool);

  const seed = async (slug: string) => {
    const [org] = await db.insert(organizations).values({ name: slug, slug }).returning();
    const [member] = await db
      .insert(members)
      .values({ orgId: org!.id, kind: "agent", role: "member" })
      .returning();
    const [team] = await db
      .insert(teams)
      .values({ orgId: org!.id, name: slug, key: slug.toUpperCase() })
      .returning();
    return { orgId: org!.id, memberId: member!.id, teamId: team!.id };
  };

  return { db, a: await seed("aaa"), b: await seed("bbb") };
}

describe("row-level security", () => {
  it("a scope sees only its own organization's rows", async () => {
    const { db, a } = await twoOrgs();
    const rows = await inScope(db, { orgId: a.orgId }, (tx) => tx.select().from(teams));
    expect(rows.map((team) => team.key)).toEqual(["AAA"]);
  });

  it("no scope sees nothing", async () => {
    const { db } = await twoOrgs();
    const rows = await inScope(db, {}, (tx) => tx.select().from(teams));
    expect(rows).toEqual([]);
  });

  it("refuses writes into another organization", async () => {
    const { db, a, b } = await twoOrgs();
    await expect(
      inScope(db, { orgId: a.orgId }, (tx) => tx.insert(teams).values({ orgId: b.orgId, name: "x", key: "XX" })),
    ).rejects.toMatchObject(pgError(/row-level security/));
  });

  it("refuses a reference to another organization's row", async () => {
    const { db, a, b } = await twoOrgs();
    await expect(
      inScope(db, { orgId: a.orgId }, (tx) =>
        emit(tx, a.orgId, { type: "team.created", actorId: b.memberId, subjectId: a.teamId }),
      ),
    ).rejects.toMatchObject(pgError(/foreign key/));
  });

  it("keeps the event log append-only", async () => {
    const { db, a } = await twoOrgs();
    await inScope(db, { orgId: a.orgId }, (tx) =>
      emit(tx, a.orgId, { type: "team.created", actorId: a.memberId, subjectId: a.teamId }),
    );
    await expect(
      inScope(db, { orgId: a.orgId }, (tx) => tx.update(events).set({ type: "rewritten" })),
    ).rejects.toMatchObject(pgError(/permission denied/));
    await expect(inScope(db, { orgId: a.orgId }, (tx) => tx.delete(events))).rejects.toMatchObject(pgError(/permission denied/));
  });

  it("rolls the event back with the change", async () => {
    const { db, a } = await twoOrgs();
    await expect(
      inScope(db, { orgId: a.orgId }, async (tx) => {
        await emit(tx, a.orgId, { type: "team.created", actorId: a.memberId, subjectId: a.teamId });
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");
    const rows = await inScope(db, { orgId: a.orgId }, (tx) => tx.select().from(events));
    expect(rows).toEqual([]);
  });

  it("covers every table that carries org_id", async () => {
    const { db } = await twoOrgs();
    const { rows } = await db.execute<{ table: string }>(sql`
      SELECT c.relname AS table
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`);
    expect(rows).toEqual([]);
  });

  it("gives every event of one scope the same change id, and each scope its own", async () => {
    const { db, a } = await twoOrgs();
    const change = () =>
      inScope(db, { orgId: a.orgId }, async (tx) => {
        await emit(tx, a.orgId, { type: "team.updated", actorId: a.memberId, subjectId: a.teamId });
        await emit(tx, a.orgId, { type: "team.updated", actorId: a.memberId, subjectId: a.teamId });
      });
    await change();
    await change();
    const rows = await inScope(db, { orgId: a.orgId }, (tx) => tx.select().from(events).orderBy(events.id));
    const ids = rows.map((row) => row.changeId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).toBe(ids[3]);
    expect(ids[0]).not.toBe(ids[2]);
  });

  it("does not leak a scope into the next transaction on the same connection", async () => {
    const { db, a } = await twoOrgs();
    await inScope(db, { orgId: a.orgId }, async (tx) => {
      await enterOrg(tx, a.orgId);
    });
    const [row] = await db.execute<{ org: string | null; role: string }>(
      sql`SELECT edict_org_id() AS org, current_user AS role`,
    ).then((r) => r.rows);
    expect(row).toEqual({ org: null, role: expect.not.stringMatching(/^edict_app$/) });
  });
});
