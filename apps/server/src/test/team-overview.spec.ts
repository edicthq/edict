import { describe, expect, it } from "vitest";
import { runner } from "./agent-client.js";
import { createTeam, join, orgWithOwner } from "./org.js";
import { startTestServer } from "./server.js";

describe("team overview", () => {
  it("counts each visible team's open work and lists its members", async () => {
    const t = await startTestServer();
    const { owner, org, ownerId } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const ops = await createTeam(owner, org, "OPS", { private: true });
    const bea = await join(t.baseUrl, owner, org, "Bea", "member", [eng.id]);
    const ferro = await runner(t.baseUrl, owner, org, [eng.id]);

    const statuses = (await owner.get(`${org}/teams/${eng.id}/statuses`)).body as { id: string; category: string }[];
    const inCategory = (category: string) => statuses.find((s) => s.category === category)!.id;
    const create = async (title: string) => (await owner.post(`${org}/teams/${eng.id}/issues`, { title })).body;
    await create("Open, nobody on it");
    const working = await create("An agent works on it");
    await owner.patch(`${org}/issues/${working.identifier}`, {
      version: working.version,
      statusId: inCategory("in_progress"),
      delegateId: ferro.id,
    });
    const shipped = await create("Shipped");
    await owner.patch(`${org}/issues/${shipped.identifier}`, { version: shipped.version, statusId: inCategory("done") });

    const res = await owner.get(`${org}/team-overview`);
    expect(res.status).toBe(200);
    const rows = res.body as { teamId: string; memberIds: string[] }[];
    const byTeam = new Map(rows.map((row) => [row.teamId, row]));
    expect(byTeam.get(eng.id)).toMatchObject({ open: 2, inProgress: 1, delegated: 1 });
    expect(new Set(byTeam.get(eng.id)?.memberIds)).toEqual(
      new Set([ownerId, bea.memberId, ferro.id]),
    );
    expect(byTeam.get(ops.id)).toMatchObject({ open: 0, inProgress: 0, delegated: 0, memberIds: [ownerId] });

    // A Member sees only the teams they can see.
    const seen = (await bea.client.get(`${org}/team-overview`)).body as { teamId: string }[];
    expect(seen.map((row) => row.teamId)).toEqual([eng.id]);
  });
});
