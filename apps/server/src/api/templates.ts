import { createRoute, z } from "@hono/zod-openapi";
import { and, asc, eq } from "drizzle-orm";
import { emit, templates, type Transaction } from "@edicthq/db";
import { CreateTemplate, Id, Template, UpdateTemplate } from "@edicthq/schema";
import type { Caller } from "./callers.js";
import { requireAgentPower, visibleTeam } from "./access.js";
import { body, errors, inOrg, json, noContent, OrgParams, router, type ApiDeps } from "./context.js";
import { checkLabels } from "./issue-data.js";
import { changesOf, forbidden, invalid, isUniqueViolation, notFound, requireVersion } from "./errors.js";

type TemplateRow = typeof templates.$inferSelect;

// The glossary: a template is a team's prefilled starting point for a new
// issue. Every member of the team reads and uses it; changing one is for
// people who manage the team's labels and for agents with the settings power.

function toTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    teamId: row.teamId,
    name: row.name,
    title: row.title,
    description: row.description,
    labelIds: row.labelIds,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const TeamParams = OrgParams.extend({ teamId: Id });
const TemplateParams = TeamParams.extend({ templateId: Id });
const tags = ["Templates"];

const listTemplates = createRoute({
  method: "get",
  path: "/organizations/{orgId}/teams/{teamId}/templates",
  tags,
  summary: "A team's templates, in order of creation",
  request: { params: TeamParams },
  responses: { 200: json(z.array(Template), "Templates"), ...errors("unauthorized", "not_found") },
});

const createTemplate = createRoute({
  method: "post",
  path: "/organizations/{orgId}/teams/{teamId}/templates",
  tags,
  summary: "Add a prefilled starting point for new issues",
  description: "Templates of a team can't share a name.",
  request: { params: TeamParams, ...body(CreateTemplate) },
  responses: { 201: json(Template, "The new template"), ...errors("invalid_request", "unauthorized", "forbidden", "not_found") },
});

const getTemplate = createRoute({
  method: "get",
  path: "/organizations/{orgId}/teams/{teamId}/templates/{templateId}",
  tags,
  summary: "One template",
  request: { params: TemplateParams },
  responses: { 200: json(Template, "The template"), ...errors("unauthorized", "not_found") },
});

const updateTemplate = createRoute({
  method: "patch",
  path: "/organizations/{orgId}/teams/{teamId}/templates/{templateId}",
  tags,
  summary: "Change a template",
  request: { params: TemplateParams, ...body(UpdateTemplate) },
  responses: {
    200: json(Template, "The template"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found", "conflict"),
  },
});

const deleteTemplate = createRoute({
  method: "delete",
  path: "/organizations/{orgId}/teams/{teamId}/templates/{templateId}",
  tags,
  summary: "Delete a template",
  description: "A deletion is immediate: templates have no trash and no identifier to keep resolving.",
  request: { params: TemplateParams },
  responses: { ...noContent, ...errors("unauthorized", "forbidden", "not_found") },
});

async function templateForUpdate(tx: Transaction, caller: Caller, orgId: string, teamId: string, templateId: string, action: string): Promise<TemplateRow> {
  await visibleTeam(tx, caller, teamId);
  const [row] = await tx.select().from(templates).where(and(eq(templates.orgId, orgId), eq(templates.id, templateId))).for("update");
  if (!row || row.teamId !== teamId) throw notFound("template");
  if (caller.role === "guest") {
    throw forbidden(`Guests can't ${action} a template.`);
  }
  requireAgentPower(caller, "settings", `${action} templates`);
  return row;
}

export function templateRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(listTemplates, async (c) => {
    const { orgId, teamId } = c.req.valid("param");
    const rows = await inOrg(deps, c, orgId, async (tx, caller) => {
      await visibleTeam(tx, caller, teamId);
      return tx
        .select()
        .from(templates)
        .where(and(eq(templates.orgId, orgId), eq(templates.teamId, teamId)))
        .orderBy(asc(templates.id));
    });
    return c.json(rows.map(toTemplate), 200);
  });

  app.openapi(createTemplate, async (c) => {
    const { orgId, teamId } = c.req.valid("param");
    const input = c.req.valid("json");
    let row: TemplateRow;
    try {
      row = await inOrg(deps, c, orgId, async (tx, caller) => {
        if (caller.role === "guest") {
          throw forbidden("Guests can't create a template.");
        }
        requireAgentPower(caller, "settings", "create templates");
        const team = await visibleTeam(tx, caller, teamId);
        if (input.labelIds.length) await checkLabels(tx, team, input.labelIds);        const [created] = await tx
          .insert(templates)
          .values({ orgId, teamId, name: input.name, title: input.title, description: input.description, labelIds: input.labelIds })
          .returning();
        await emit(tx, orgId, {
          type: "template.created",
          actorId: caller.id,
          subjectId: created!.id,
          data: { teamId, name: created!.name },
        });
        return created!;
      });
    } catch (error) {
      if (isUniqueViolation(error, "templates_team_name_unique")) {
        throw invalid("This team already has a template with this name.");
      }
      throw error;
    }
    return c.json(toTemplate(row), 201);
  });

  app.openapi(getTemplate, async (c) => {
    const { orgId, teamId, templateId } = c.req.valid("param");
    const row = await inOrg(deps, c, orgId, async (tx, caller) => {
      await visibleTeam(tx, caller, teamId);
      const [current] = await tx
        .select()
        .from(templates)
        .where(and(eq(templates.orgId, orgId), eq(templates.teamId, teamId), eq(templates.id, templateId)));
      if (!current) throw notFound("template");
      return current;
    });
    return c.json(toTemplate(row), 200);
  });

  app.openapi(updateTemplate, async (c) => {
    const { orgId, teamId, templateId } = c.req.valid("param");
    const { version, ...input } = c.req.valid("json");
    let row: TemplateRow;
    try {
      row = await inOrg(deps, c, orgId, async (tx, caller) => {
        const current = await templateForUpdate(tx, caller, orgId, teamId, templateId, "change");
        requireVersion(current.version, version, "template");
        const changes = changesOf(current, input);
        if (Object.keys(changes).length === 0) return current;
        if (input.labelIds?.length) {
          const team = await visibleTeam(tx, caller, teamId);
          await checkLabels(tx, team, input.labelIds);
        }
        const [updated] = await tx
          .update(templates)
          .set({ ...input, labelIds: changes.labelIds ? input.labelIds : current.labelIds, updatedAt: new Date(), version: current.version + 1 })
          .where(eq(templates.id, templateId))
          .returning();
        await emit(tx, orgId, {
          type: "template.updated",
          actorId: caller.id,
          subjectId: templateId,
          data: { teamId, changes, version: updated!.version },
        });
        return updated!;
      });
    } catch (error) {
      if (isUniqueViolation(error, "templates_team_name_unique")) {
        throw invalid("This team already has a template with this name.");
      }
      throw error;
    }
    return c.json(toTemplate(row), 200);
  });

  app.openapi(deleteTemplate, async (c) => {
    const { orgId, teamId, templateId } = c.req.valid("param");
    await inOrg(deps, c, orgId, async (tx, caller) => {
      const current = await templateForUpdate(tx, caller, orgId, teamId, templateId, "delete");
      await tx.delete(templates).where(eq(templates.id, templateId));
      await emit(tx, orgId, {
        type: "template.deleted",
        actorId: caller.id,
        subjectId: templateId,
        data: { teamId, name: current.name },
      });
    });
    return c.body(null, 204);
  });

  return app;
}
