import { createRoute, z } from "@hono/zod-openapi";
import { and, asc, eq, max, sql } from "drizzle-orm";
import { emit, statuses, type Transaction } from "@edicthq/db";
import { CreateStatus, Id, Status, UpdateStatus, type StatusCategory } from "@edicthq/schema";
import { requireRole, visibleTeam } from "./access.js";
import { body, errors, inOrg, json, OrgParams, router, type ApiDeps } from "./context.js";
import { changesOf, conflict, isUniqueViolation, notFound, requireVersion } from "./errors.js";

type StatusRow = typeof statuses.$inferSelect;

export function toStatus(row: StatusRow): Status {
  return {
    id: row.id,
    teamId: row.teamId,
    name: row.name,
    category: row.category,
    position: row.position,
    default: row.isDefault,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

// The workflow every new team starts with. Migration 0008 gave teams created
// before M2 the same one.
const defaultStatuses: { name: string; category: StatusCategory; isDefault?: boolean }[] = [
  { name: "Backlog", category: "backlog" },
  { name: "Todo", category: "todo", isDefault: true },
  { name: "In Progress", category: "in_progress" },
  { name: "In Review", category: "in_progress" },
  { name: "Done", category: "done" },
  { name: "Canceled", category: "canceled" },
];

export async function seedStatuses(tx: Transaction, orgId: string, teamId: string): Promise<StatusRow[]> {
  const positions = new Map<StatusCategory, number>();
  return tx
    .insert(statuses)
    .values(
      defaultStatuses.map((status) => {
        const position = positions.get(status.category) ?? 0;
        positions.set(status.category, position + 1);
        return { orgId, teamId, position, isDefault: false, ...status };
      }),
    )
    .returning();
}

// A team's statuses in workflow order: by category, then position.
export function teamStatuses(tx: Transaction, teamId: string) {
  return tx
    .select()
    .from(statuses)
    .where(eq(statuses.teamId, teamId))
    .orderBy(asc(statuses.category), asc(statuses.position), asc(statuses.createdAt));
}

const TeamParams = OrgParams.extend({ teamId: Id });
const StatusParams = TeamParams.extend({ statusId: Id });

const listStatuses = createRoute({
  method: "get",
  path: "/organizations/{orgId}/teams/{teamId}/statuses",
  tags: ["Statuses"],
  summary: "A team's statuses, in workflow order",
  request: { params: TeamParams },
  responses: {
    200: json(z.array(Status), "Statuses by category, then position"),
    ...errors("unauthorized", "not_found"),
  },
});

const createStatus = createRoute({
  method: "post",
  path: "/organizations/{orgId}/teams/{teamId}/statuses",
  tags: ["Statuses"],
  summary: "Add a status to a team's workflow",
  request: { params: TeamParams, ...body(CreateStatus) },
  responses: {
    201: json(Status, "The new status"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found", "conflict"),
  },
});

const updateStatus = createRoute({
  method: "patch",
  path: "/organizations/{orgId}/teams/{teamId}/statuses/{statusId}",
  tags: ["Statuses"],
  summary: "Rename, recategorize or reorder a status, or make it the default",
  request: { params: StatusParams, ...body(UpdateStatus) },
  responses: {
    200: json(Status, "The status"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found", "conflict"),
  },
});

function nameTaken(error: unknown, name: string): never {
  if (isUniqueViolation(error, "statuses_team_id_name_unique")) {
    throw conflict(`The team already has a status named ${name}.`);
  }
  throw error;
}

export function statusRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(listStatuses, async (c) => {
    const { orgId, teamId } = c.req.valid("param");
    const rows = await inOrg(deps, c, orgId, async (tx, caller) => {
      await visibleTeam(tx, caller, teamId);
      return teamStatuses(tx, teamId);
    });
    return c.json(rows.map(toStatus), 200);
  });

  app.openapi(createStatus, async (c) => {
    const { orgId, teamId } = c.req.valid("param");
    const input = c.req.valid("json");
    const status = await inOrg(deps, c, orgId, async (tx, caller) => {
      await visibleTeam(tx, caller, teamId);
      requireRole(caller, "admin", "change a team's workflow");
      let position = input.position;
      if (position === undefined) {
        const [last] = await tx
          .select({ position: max(statuses.position) })
          .from(statuses)
          .where(and(eq(statuses.teamId, teamId), eq(statuses.category, input.category)));
        position = (last?.position ?? -1) + 1;
      }
      const [status] = await tx
        .insert(statuses)
        .values({ orgId, teamId, name: input.name, category: input.category, position })
        .returning();
      await emit(tx, orgId, {
        type: "status.created",
        actorId: caller.id,
        subjectId: status!.id,
        data: { teamId, name: status!.name, category: status!.category, position },
      });
      return status!;
    }).catch((error: unknown) => nameTaken(error, input.name));
    return c.json(toStatus(status), 201);
  });

  app.openapi(updateStatus, async (c) => {
    const { orgId, teamId, statusId } = c.req.valid("param");
    const { version, default: makeDefault, ...fields } = c.req.valid("json");
    const status = await inOrg(deps, c, orgId, async (tx, caller) => {
      await visibleTeam(tx, caller, teamId);
      requireRole(caller, "admin", "change a team's workflow");
      const [current] = await tx
        .select()
        .from(statuses)
        .where(and(eq(statuses.teamId, teamId), eq(statuses.id, statusId)))
        .for("update");
      if (!current) {
        throw notFound("status");
      }
      requireVersion(current.version, version, "status");

      const changes: Record<string, { from: unknown; to: unknown }> = changesOf(current, fields);
      if (makeDefault && !current.isDefault) {
        changes.default = { from: false, to: true };
        const [previous] = await tx
          .update(statuses)
          .set({ isDefault: false, version: sql`${statuses.version} + 1`, updatedAt: new Date() })
          .where(and(eq(statuses.teamId, teamId), eq(statuses.isDefault, true)))
          .returning();
        if (previous) {
          await emit(tx, orgId, {
            type: "status.updated",
            actorId: caller.id,
            subjectId: previous.id,
            data: { version: previous.version, changes: { default: { from: true, to: false } } },
          });
        }
      }
      if (Object.keys(changes).length === 0) {
        return current;
      }

      const [updated] = await tx
        .update(statuses)
        .set({ ...fields, isDefault: current.isDefault || makeDefault === true, version: version + 1, updatedAt: new Date() })
        .where(eq(statuses.id, statusId))
        .returning();
      await emit(tx, orgId, {
        type: "status.updated",
        actorId: caller.id,
        subjectId: statusId,
        data: { version: updated!.version, changes },
      });
      return updated!;
    }).catch((error: unknown) => nameTaken(error, fields.name ?? ""));
    return c.json(toStatus(status), 200);
  });

  return app;
}
