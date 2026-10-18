import { createRoute, z } from "@hono/zod-openapi";
import { and, asc, eq } from "drizzle-orm";
import { emit, savedViews, type Transaction } from "@edicthq/db";
import { CreateSavedView, Id, SavedView, UpdateSavedView } from "@edicthq/schema";
import type { Caller } from "./callers.js";
import { body, errors, inOrg, json, noContent, OrgParams, router, type ApiDeps } from "./context.js";
import { visibleTeam } from "./access.js";
import { changesOf, forbidden, isUniqueViolation, invalid, notFound, requireVersion } from "./errors.js";

type SavedViewRow = typeof savedViews.$inferSelect;

// ADR 0023. A saved view is personal: the server stores its name and query,
// but only its owner reads, updates or deletes it. Query means exactly the
// team page's URL view; the schema validates it, nothing interprets it.

function toView(row: SavedViewRow): SavedView {
  return {
    id: row.id,
    teamId: row.teamId,
    memberId: row.memberId,
    name: row.name,
    query: row.query as SavedView["query"],
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const TeamParams = OrgParams.extend({ teamId: Id });
const SavedViewParams = TeamParams.extend({ savedViewId: Id });
const tags = ["Saved views"];

const listSavedViews = createRoute({
  method: "get",
  path: "/organizations/{orgId}/teams/{teamId}/saved-views",
  tags,
  summary: "A member's saved views for a team",
  request: { params: TeamParams },
  responses: { 200: json(z.array(SavedView), "Views"), ...errors("unauthorized", "forbidden", "not_found") },
});

const createSavedView = createRoute({
  method: "post",
  path: "/organizations/{orgId}/teams/{teamId}/saved-views",
  tags,
  summary: "Keep the current view under a name",
  description: "Views of the same member on a team can't share a name.",
  request: { params: TeamParams, ...body(CreateSavedView) },
  responses: { 201: json(SavedView, "The saved view"), ...errors("invalid_request", "unauthorized", "forbidden", "not_found") },
});

const getSavedView = createRoute({
  method: "get",
  path: "/organizations/{orgId}/teams/{teamId}/saved-views/{savedViewId}",
  tags,
  summary: "One saved view",
  request: { params: SavedViewParams },
  responses: { 200: json(SavedView, "The saved view"), ...errors("unauthorized", "forbidden", "not_found") },
});

const updateSavedView = createRoute({
  method: "patch",
  path: "/organizations/{orgId}/teams/{teamId}/saved-views/{savedViewId}",
  tags,
  summary: "Rename a view or change what it holds",
  request: { params: SavedViewParams, ...body(UpdateSavedView) },
  responses: {
    200: json(SavedView, "The saved view"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found", "conflict"),
  },
});

const deleteSavedView = createRoute({
  method: "delete",
  path: "/organizations/{orgId}/teams/{teamId}/saved-views/{savedViewId}",
  tags,
  summary: "Delete a saved view",
  description: "A deletion is immediate: views have no trash and no identifier to keep resolving (ADR 0023).",
  request: { params: SavedViewParams },
  responses: { ...noContent, ...errors("unauthorized", "forbidden", "not_found") },
});

async function viewRow(tx: Transaction, savedViewId: string, forUpdate = false): Promise<SavedViewRow> {
  const query = tx.select().from(savedViews).where(eq(savedViews.id, savedViewId));
  const [row] = forUpdate ? await query.for("update") : await query;
  if (!row) throw notFound("saved view");
  return row;
}

// Views belong to their members; nobody else's write should touch one.
function requireOwner(row: SavedViewRow, caller: Caller, action: string) {
  if (row.memberId !== caller.id) {
    throw forbidden(`Only the view's owner can ${action} it.`);
  }
}

export function savedViewRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(listSavedViews, async (c) => {
    const { orgId, teamId } = c.req.valid("param");
    const rows = await inOrg(deps, c, orgId, async (tx, caller) => {
      await visibleTeam(tx, caller, teamId);
      return tx
        .select()
        .from(savedViews)
        .where(and(eq(savedViews.orgId, orgId), eq(savedViews.teamId, teamId), eq(savedViews.memberId, caller.id)))
        .orderBy(asc(savedViews.id));
    });
    return c.json(rows.map(toView), 200);
  });

  app.openapi(createSavedView, async (c) => {
    const { orgId, teamId } = c.req.valid("param");
    const input = c.req.valid("json");
    let row: SavedViewRow;
    try {
      row = await inOrg(deps, c, orgId, async (tx, caller) => {
        await visibleTeam(tx, caller, teamId);
        const [created] = await tx
          .insert(savedViews)
          .values({ orgId, teamId, memberId: caller.id, name: input.name, query: input.query })
          .returning();
        await emit(tx, orgId, {
          type: "view.saved",
          actorId: caller.id,
          subjectId: created!.id,
          data: { teamId, name: created!.name, query: created!.query },
        });
        return created!;
      });
    } catch (error) {
      if (isUniqueViolation(error, "saved_views_owner_name_unique")) {
        throw invalid("You already have a view with this name.");
      }
      throw error;
    }
    return c.json(toView(row), 201);
  });

  app.openapi(getSavedView, async (c) => {
    const { orgId, savedViewId } = c.req.valid("param");
    const row = await inOrg(deps, c, orgId, async (tx, caller) => {
      const current = await viewRow(tx, savedViewId);
      requireOwner(current, caller, "read");
      return current;
    });
    return c.json(toView(row), 200);
  });

  app.openapi(updateSavedView, async (c) => {
    const { orgId, teamId, savedViewId } = c.req.valid("param");
    const { version, ...input } = c.req.valid("json");
    let row: SavedViewRow;
    try {
      row = await inOrg(deps, c, orgId, async (tx, caller) => {
        const current = await viewRow(tx, savedViewId, true);
        requireOwner(current, caller, "change");
        requireVersion(current.version, version, "saved view");
        const changes: Record<string, unknown> = changesOf(current, { ...input, query: input.query ?? undefined });
        if (Object.keys(changes).length === 0) return current;
        const [updated] = await tx
          .update(savedViews)
          .set({ ...input, updatedAt: new Date(), version: (current.version ?? 0) + 1 })
          .where(eq(savedViews.id, savedViewId))
          .returning();
        await emit(tx, orgId, {
          type: "view.updated",
          actorId: caller.id,
          subjectId: savedViewId,
          data: { teamId, changes, version: updated!.version },
        });
        return updated!;
      });
    } catch (error) {
      if (isUniqueViolation(error, "saved_views_owner_name_unique")) {
        throw invalid("You already have a view with this name.");
      }
      throw error;
    }
    return c.json(toView(row), 200);
  });

  app.openapi(deleteSavedView, async (c) => {
    const { orgId, teamId, savedViewId } = c.req.valid("param");
    await inOrg(deps, c, orgId, async (tx, caller) => {
      const current = await viewRow(tx, savedViewId, true);
      requireOwner(current, caller, "delete");
      await tx.delete(savedViews).where(eq(savedViews.id, savedViewId));
      await emit(tx, orgId, {
        type: "view.deleted",
        actorId: caller.id,
        subjectId: savedViewId,
        data: { teamId, name: current.name },
      });
    });
    return c.body(null, 204);
  });

  return app;
}
