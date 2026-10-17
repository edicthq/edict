import { createRoute, z } from "@hono/zod-openapi";
import { and, desc, eq, lt } from "drizzle-orm";
import { events } from "@edicthq/db";
import { Event, Id } from "@edicthq/schema";
import { requireRole } from "./access.js";
import { OrgParams, errors, inOrg, json, router, type ApiDeps } from "./context.js";

const listEvents = createRoute({
  method: "get",
  path: "/organizations/{orgId}/events",
  tags: ["Events"],
  summary: "The organization's event log, newest first",
  request: {
    params: OrgParams,
    query: z.object({
      // Event IDs are UUIDv7, so they sort by time. Pass the last ID of a page
      // to get the page before it.
      before: Id.optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
  },
  responses: {
    200: json(z.array(Event), "Events"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found"),
  },
});

export function eventRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(listEvents, async (c) => {
    const { orgId } = c.req.valid("param");
    const { before, limit } = c.req.valid("query");
    const rows = await inOrg(deps, c, orgId, (tx, caller) => {
      requireRole(caller, "admin", "read the event log");
      return tx
        .select()
        .from(events)
        .where(and(eq(events.orgId, orgId), before ? lt(events.id, before) : undefined))
        .orderBy(desc(events.id))
        .limit(limit);
    });
    return c.json(
      rows.map((row) => ({
        id: row.id,
        type: row.type,
        actorId: row.actorId,
        onBehalfOfId: row.onBehalfOfId,
        subjectId: row.subjectId,
        changeId: row.changeId,
        data: row.data,
        createdAt: row.createdAt.toISOString(),
      })),
      200,
    );
  });

  return app;
}
