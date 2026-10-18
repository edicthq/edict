import { createRoute, z } from "@hono/zod-openapi";
import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { emit, issueLabels, issues, labels, type Transaction } from "@edicthq/db";
import { CreateLabel, Id, Label, UpdateLabel } from "@edicthq/schema";
import type { Caller } from "./callers.js";
import { requireAgentPower, requireRole, visibleTeam } from "./access.js";
import { body, errors, inOrg, json, noContent, OrgParams, router, type ApiDeps } from "./context.js";
import { changesOf, conflict, forbidden, notFound, requireVersion } from "./errors.js";

type LabelRow = typeof labels.$inferSelect;

export function toLabel(row: LabelRow): Label {
  return {
    id: row.id,
    name: row.name,
    hue: row.hue,
    teamId: row.teamId,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

// A stable hue from the name, for labels created without one.
function hueOf(name: string): number {
  let hash = 0;
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

// One name means one label (see labels in packages/db): an organization label
// clashes with any label of that name, a team label with the organization's
// and its own team's. The lock serializes label names per organization, since
// no single index covers both scopes.
async function requireFreeName(tx: Transaction, orgId: string, teamId: string | null, name: string, exceptId?: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('labels:' || ${orgId}))`);
  const [clash] = await tx
    .select({ name: labels.name, teamId: labels.teamId })
    .from(labels)
    .where(
      and(
        eq(labels.orgId, orgId),
        sql`lower(${labels.name}) = lower(${name})`,
        exceptId ? ne(labels.id, exceptId) : undefined,
        teamId ? or(isNull(labels.teamId), eq(labels.teamId, teamId)) : undefined,
      ),
    );
  if (clash) {
    throw conflict(
      clash.teamId
        ? `A team already has a label named ${clash.name}. Rename it first, or use a different name.`
        : `There's already an organization label named ${clash.name}.`,
    );
  }
}

// Admins and Owners manage organization labels. Anyone but a guest who can
// see a team manages its labels.
async function requireLabelRights(tx: Transaction, caller: Caller, teamId: string | null) {
  if (teamId === null) {
    requireRole(caller, "admin", "manage organization labels");
    return;
  }
  await visibleTeam(tx, caller, teamId);
  if (caller.role === "guest") {
    throw forbidden("Guests can't manage labels.");
  }
  requireAgentPower(caller, "settings", "manage labels");
}

async function labelForUpdate(tx: Transaction, caller: Caller, labelId: string): Promise<LabelRow> {
  const [label] = await tx.select().from(labels).where(eq(labels.id, labelId)).for("update");
  if (!label) throw notFound("label");
  if (label.teamId) await visibleTeam(tx, caller, label.teamId).catch(() => Promise.reject(notFound("label")));
  await requireLabelRights(tx, caller, label.teamId);
  return label;
}

const TeamParams = OrgParams.extend({ teamId: Id });
const LabelParams = OrgParams.extend({ labelId: Id });

const listOrgLabels = createRoute({
  method: "get",
  path: "/organizations/{orgId}/labels",
  tags: ["Labels"],
  summary: "The organization's labels, which every team can use",
  request: { params: OrgParams },
  responses: { 200: json(z.array(Label), "Labels by name"), ...errors("unauthorized", "not_found") },
});

const createOrgLabel = createRoute({
  method: "post",
  path: "/organizations/{orgId}/labels",
  tags: ["Labels"],
  summary: "Create an organization label",
  request: { params: OrgParams, ...body(CreateLabel) },
  responses: {
    201: json(Label, "The new label"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found", "conflict"),
  },
});

const listTeamLabels = createRoute({
  method: "get",
  path: "/organizations/{orgId}/teams/{teamId}/labels",
  tags: ["Labels"],
  summary: "Labels a team's issues can have: the organization's and the team's own",
  request: { params: TeamParams },
  responses: { 200: json(z.array(Label), "Labels by name"), ...errors("unauthorized", "not_found") },
});

const createTeamLabel = createRoute({
  method: "post",
  path: "/organizations/{orgId}/teams/{teamId}/labels",
  tags: ["Labels"],
  summary: "Create a label for one team",
  request: { params: TeamParams, ...body(CreateLabel) },
  responses: {
    201: json(Label, "The new label"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found", "conflict"),
  },
});

const updateLabel = createRoute({
  method: "patch",
  path: "/organizations/{orgId}/labels/{labelId}",
  tags: ["Labels"],
  summary: "Rename or recolor a label",
  request: { params: LabelParams, ...body(UpdateLabel) },
  responses: {
    200: json(Label, "The label"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found", "conflict"),
  },
});

const deleteLabel = createRoute({
  method: "delete",
  path: "/organizations/{orgId}/labels/{labelId}",
  tags: ["Labels"],
  summary: "Delete a label and take it off every issue",
  request: { params: LabelParams },
  responses: { ...noContent, ...errors("unauthorized", "forbidden", "not_found") },
});

export function labelRoutes(deps: ApiDeps) {
  const app = router();

  const create = (orgId: string, teamId: string | null, input: z.infer<typeof CreateLabel>, c: Parameters<typeof inOrg>[1]) =>
    inOrg(deps, c, orgId, async (tx, caller) => {
      await requireLabelRights(tx, caller, teamId);
      await requireFreeName(tx, orgId, teamId, input.name);
      const [label] = await tx
        .insert(labels)
        .values({ orgId, teamId, name: input.name, hue: input.hue ?? hueOf(input.name) })
        .returning();
      await emit(tx, orgId, {
        type: "label.created",
        actorId: caller.id,
        subjectId: label!.id,
        data: { name: label!.name, hue: label!.hue, teamId },
      });
      return toLabel(label!);
    });

  app.openapi(listOrgLabels, async (c) => {
    const { orgId } = c.req.valid("param");
    const rows = await inOrg(deps, c, orgId, (tx) =>
      tx.select().from(labels).where(isNull(labels.teamId)).orderBy(asc(sql`lower(${labels.name})`)),
    );
    return c.json(rows.map(toLabel), 200);
  });

  app.openapi(createOrgLabel, async (c) => {
    const { orgId } = c.req.valid("param");
    return c.json(await create(orgId, null, c.req.valid("json"), c), 201);
  });

  app.openapi(listTeamLabels, async (c) => {
    const { orgId, teamId } = c.req.valid("param");
    const rows = await inOrg(deps, c, orgId, async (tx, caller) => {
      await visibleTeam(tx, caller, teamId);
      return tx
        .select()
        .from(labels)
        .where(or(isNull(labels.teamId), eq(labels.teamId, teamId)))
        .orderBy(asc(sql`lower(${labels.name})`));
    });
    return c.json(rows.map(toLabel), 200);
  });

  app.openapi(createTeamLabel, async (c) => {
    const { orgId, teamId } = c.req.valid("param");
    return c.json(await create(orgId, teamId, c.req.valid("json"), c), 201);
  });

  app.openapi(updateLabel, async (c) => {
    const { orgId, labelId } = c.req.valid("param");
    const { version, ...fields } = c.req.valid("json");
    const label = await inOrg(deps, c, orgId, async (tx, caller) => {
      const current = await labelForUpdate(tx, caller, labelId);
      requireVersion(current.version, version, "label");
      const changes = changesOf(current, fields);
      if (Object.keys(changes).length === 0) return current;
      if (changes.name) await requireFreeName(tx, orgId, current.teamId, fields.name!, labelId);
      const [updated] = await tx
        .update(labels)
        .set({ ...fields, version: version + 1, updatedAt: new Date() })
        .where(eq(labels.id, labelId))
        .returning();
      await emit(tx, orgId, {
        type: "label.updated",
        actorId: caller.id,
        subjectId: labelId,
        data: { version: updated!.version, changes },
      });
      return updated!;
    });
    return c.json(toLabel(label), 200);
  });

  app.openapi(deleteLabel, async (c) => {
    const { orgId, labelId } = c.req.valid("param");
    await inOrg(deps, c, orgId, async (tx, caller) => {
      requireAgentPower(caller, "delete", "delete labels");
      const label = await labelForUpdate(tx, caller, labelId);

      // Each issue that loses the label changes like any other edit: a new
      // version and an event, so its history and undo see it.
      const tagged = await tx
        .select({ issue: issues })
        .from(issueLabels)
        .innerJoin(issues, eq(issues.id, issueLabels.issueId))
        .where(eq(issueLabels.labelId, labelId))
        .for("update", { of: issues });
      const all = tagged.length
        ? await tx.select().from(issueLabels).where(inArray(issueLabels.issueId, tagged.map((t) => t.issue.id)))
        : [];
      for (const { issue } of tagged) {
        const from = all.filter((l) => l.issueId === issue.id).map((l) => l.labelId).sort();
        const nextVersion = issue.version + 1;
        await tx
          .update(issues)
          .set({ version: nextVersion, fieldVersions: { ...issue.fieldVersions, labelIds: nextVersion }, updatedAt: new Date() })
          .where(eq(issues.id, issue.id));
        await emit(tx, orgId, {
          type: "issue.updated",
          actorId: caller.id,
          subjectId: issue.id,
          data: { version: nextVersion, changes: { labelIds: { from, to: from.filter((id) => id !== labelId) } } },
        });
      }

      await tx.delete(labels).where(eq(labels.id, labelId));
      await emit(tx, orgId, {
        type: "label.deleted",
        actorId: caller.id,
        subjectId: labelId,
        data: { name: label.name, hue: label.hue, teamId: label.teamId, issueIds: tagged.map((t) => t.issue.id) },
      });
    });
    return c.body(null, 204);
  });

  return app;
}
