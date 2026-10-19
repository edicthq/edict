import { createRoute, z } from "@hono/zod-openapi";
import { and, desc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { emit, issues, projects, statuses, teams, type Transaction } from "@edicthq/db";
import {
  CreateProject,
  Issue,
  Project,
  ProjectConflict,
  type ProjectProgress,
  ProjectRef,
  UpdateProject,
} from "@edicthq/schema";
import type { Caller } from "./callers.js";
import { activeMember, requireAgentPower, teamVisibility } from "./access.js";
import { body, errors, inOrg, json, noContent, OrgParams, router, type ApiDeps } from "./context.js";
import { conflict, forbidden, gone, isUniqueViolation, notFound } from "./errors.js";
import { toIssues } from "./issue-data.js";

type ProjectRow = typeof projects.$inferSelect;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const currentChange = sql`nullif(current_setting('edict.change_id', true), '')::uuid`;

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "project";
}

export async function projectIdOf(tx: Transaction, orgId: string, ref: string): Promise<string | undefined> {
  if (uuidPattern.test(ref)) {
    const [row] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.orgId, orgId), eq(projects.id, ref)));
    return row?.id;
  }
  const [row] = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.orgId, orgId), eq(sql`lower(${projects.slug})`, ref.toLowerCase())));
  return row?.id;
}

// Projects span teams, so Members see every one. A guest, or an API key
// narrowed to some teams, sees only projects that hold an issue in a team it
// can see. A project's progress counts only issues the caller can see.
function seesEveryProject(caller: Caller): boolean {
  return caller.access.role !== "guest" && caller.keyTeamIds === null;
}

export function projectVisibility(tx: Transaction, caller: Caller): SQL | undefined {
  if (seesEveryProject(caller)) return undefined;
  return inArray(
    projects.id,
    tx
      .select({ id: sql`${issues.projectId}` })
      .from(issues)
      .innerJoin(teams, eq(teams.id, issues.teamId))
      .where(and(isNull(issues.deletedAt), teamVisibility(tx, caller))),
  );
}

// Guests work only in their teams' issues: projects are for Members.
export function requireProjectEditor(caller: Caller, action: string): void {
  if (caller.access.role === "guest") {
    throw forbidden(`Guests cannot ${action}. They work only in the issues of their teams.`);
  }
}

export async function visibleProject(
  tx: Transaction,
  caller: Caller,
  ref: string,
  options: { forUpdate?: boolean; trashed?: boolean } = {},
): Promise<ProjectRow> {
  const projectId = await projectIdOf(tx, caller.orgId, ref);
  if (!projectId) {
    throw notFound("project");
  }
  const query = tx
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, caller.orgId), eq(projects.id, projectId), projectVisibility(tx, caller)));
  const [row] = await (options.forUpdate ? query.for("update", { of: projects }) : query);
  if (!row) {
    throw notFound("project");
  }
  if (row.deletedAt && !options.trashed) {
    throw gone(`${row.name} is in the trash.`);
  }
  return row;
}

export async function calculateProjectsProgress(
  tx: Transaction,
  caller: Caller,
  projectIds: string[],
): Promise<Map<string, ProjectProgress>> {
  const progressMap = new Map<string, ProjectProgress>();
  for (const id of projectIds) {
    progressMap.set(id, {
      total: 0,
      completed: 0,
      percentage: 0,
      byCategory: { backlog: 0, todo: 0, in_progress: 0, done: 0, canceled: 0 },
      estimate: { total: 0, completed: 0 },
    });
  }
  if (projectIds.length === 0) return progressMap;

  const rows = await tx
    .select({
      projectId: issues.projectId,
      category: statuses.category,
      estimate: issues.estimate,
    })
    .from(issues)
    .innerJoin(statuses, eq(statuses.id, issues.statusId))
    .innerJoin(teams, eq(teams.id, issues.teamId))
    .where(and(inArray(issues.projectId, projectIds), isNull(issues.deletedAt), teamVisibility(tx, caller)));

  for (const row of rows) {
    if (!row.projectId) continue;
    const progress = progressMap.get(row.projectId);
    if (!progress) continue;

    progress.total += 1;
    progress.byCategory[row.category] += 1;
    const est = row.estimate ?? 0;
    progress.estimate.total += est;

    if (row.category === "done") {
      progress.completed += 1;
      progress.estimate.completed += est;
    }
  }

  for (const progress of progressMap.values()) {
    const active = progress.total - progress.byCategory.canceled;
    progress.percentage = active > 0 ? Math.round((progress.completed / active) * 100) : 0;
  }

  return progressMap;
}

export function toProject(row: ProjectRow, progress: ProjectProgress): Project {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    leadId: row.leadId,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    targetDate: row.targetDate ? row.targetDate.toISOString() : null,
    progress,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const ProjectParams = OrgParams.extend({ projectRef: ProjectRef });

const listProjects = createRoute({
  method: "get",
  path: "/organizations/{orgId}/projects",
  tags: ["Projects"],
  summary: "List projects in the organization",
  request: { params: OrgParams },
  responses: {
    200: json(z.array(Project), "Organization projects"),
    ...errors("unauthorized", "not_found"),
  },
});

const createProject = createRoute({
  method: "post",
  path: "/organizations/{orgId}/projects",
  tags: ["Projects"],
  summary: "Create a project",
  request: { params: OrgParams, ...body(CreateProject) },
  responses: {
    201: json(Project, "The created project"),
    ...errors("invalid_request", "conflict", "unauthorized", "not_found"),
  },
});

const getProject = createRoute({
  method: "get",
  path: "/organizations/{orgId}/projects/{projectRef}",
  tags: ["Projects"],
  summary: "Get a project by ID or slug",
  request: { params: ProjectParams },
  responses: {
    200: json(Project, "The project"),
    ...errors("unauthorized", "not_found", "gone"),
  },
});

const updateProject = createRoute({
  method: "patch",
  path: "/organizations/{orgId}/projects/{projectRef}",
  tags: ["Projects"],
  summary: "Update a project",
  request: { params: ProjectParams, ...body(UpdateProject) },
  responses: {
    200: json(Project, "The updated project"),
    409: json(ProjectConflict, "Optimistic concurrency conflict"),
    ...errors("invalid_request", "unauthorized", "not_found", "gone"),
  },
});

const deleteProject = createRoute({
  method: "delete",
  path: "/organizations/{orgId}/projects/{projectRef}",
  tags: ["Projects"],
  summary: "Move a project to trash",
  request: { params: ProjectParams },
  responses: {
    ...noContent,
    ...errors("unauthorized", "forbidden", "not_found", "gone"),
  },
});

const restoreProject = createRoute({
  method: "post",
  path: "/organizations/{orgId}/projects/{projectRef}/restore",
  tags: ["Projects"],
  summary: "Restore a project from trash",
  request: { params: ProjectParams },
  responses: {
    200: json(Project, "The restored project"),
    ...errors("unauthorized", "not_found"),
  },
});

const listProjectIssues = createRoute({
  method: "get",
  path: "/organizations/{orgId}/projects/{projectRef}/issues",
  tags: ["Projects"],
  summary: "List issues belonging to a project across teams",
  request: { params: ProjectParams },
  responses: {
    200: json(z.array(Issue), "Issues belonging to the project"),
    ...errors("unauthorized", "not_found", "gone"),
  },
});

export function projectRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(listProjects, async (c) => {
    const { orgId } = c.req.valid("param");
    const list = await inOrg(deps, c, orgId, async (tx, caller) => {
      const rows = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.orgId, orgId), isNull(projects.deletedAt), projectVisibility(tx, caller)))
        .orderBy(desc(projects.createdAt));

      const progressMap = await calculateProjectsProgress(
        tx,
        caller,
        rows.map((r) => r.id),
      );

      return rows.map((row) =>
        toProject(
          row,
          progressMap.get(row.id) ?? {
            total: 0,
            completed: 0,
            percentage: 0,
            byCategory: { backlog: 0, todo: 0, in_progress: 0, done: 0, canceled: 0 },
            estimate: { total: 0, completed: 0 },
          },
        ),
      );
    });
    return c.json(list, 200);
  });

  app.openapi(createProject, async (c) => {
    const { orgId } = c.req.valid("param");
    const input = c.req.valid("json");
    const project = await inOrg(deps, c, orgId, async (tx, caller) => {
      requireProjectEditor(caller, "create projects");
      if (input.leadId) {
        await activeMember(tx, orgId, input.leadId);
      }

      let slug = input.slug ? input.slug.toLowerCase().trim() : slugify(input.name);

      // Verify unique slug within org
      const [existing] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.orgId, orgId), eq(sql`lower(${projects.slug})`, slug), isNull(projects.deletedAt)));
      if (existing) {
        if (input.slug) {
          throw conflict(`A project with slug "${slug}" already exists in this organization.`);
        }
        // Auto-suffix slug
        let counter = 1;
        while (counter <= 50) {
          const candidate = `${slug}-${counter}`;
          const [clash] = await tx
            .select({ id: projects.id })
            .from(projects)
            .where(and(eq(projects.orgId, orgId), eq(sql`lower(${projects.slug})`, candidate), isNull(projects.deletedAt)));
          if (!clash) {
            slug = candidate;
            break;
          }
          counter++;
        }
      }

      const startDate = input.startDate ? new Date(input.startDate) : null;
      const targetDate = input.targetDate ? new Date(input.targetDate) : null;

      try {
        const [row] = await tx
          .insert(projects)
          .values({
            orgId,
            name: input.name,
            slug,
            description: input.description,
            status: input.status,
            leadId: input.leadId,
            startDate,
            targetDate,
          })
          .returning();

        const progress: ProjectProgress = {
          total: 0,
          completed: 0,
          percentage: 0,
          byCategory: { backlog: 0, todo: 0, in_progress: 0, done: 0, canceled: 0 },
          estimate: { total: 0, completed: 0 },
        };

        const result = toProject(row!, progress);
        await emit(tx, orgId, {
          type: "project.created",
          actorId: caller.id,
          subjectId: row!.id,
          data: { name: result.name, slug: result.slug, status: result.status },
        });
        return result;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict(`A project with slug "${slug}" already exists in this organization.`);
        }
        throw error;
      }
    });
    return c.json(project, 201);
  });

  app.openapi(getProject, async (c) => {
    const { orgId, projectRef } = c.req.valid("param");
    const result = await inOrg(deps, c, orgId, async (tx, caller) => {
      const row = await visibleProject(tx, caller, projectRef);
      const progressMap = await calculateProjectsProgress(tx, caller, [row.id]);
      return toProject(
        row,
        progressMap.get(row.id) ?? {
          total: 0,
          completed: 0,
          percentage: 0,
          byCategory: { backlog: 0, todo: 0, in_progress: 0, done: 0, canceled: 0 },
          estimate: { total: 0, completed: 0 },
        },
      );
    });
    return c.json(result, 200);
  });

  app.openapi(updateProject, async (c) => {
    const { orgId, projectRef } = c.req.valid("param");
    const input = c.req.valid("json");
    const result = await inOrg(deps, c, orgId, async (tx, caller) => {
      requireProjectEditor(caller, "change projects");
      const row = await visibleProject(tx, caller, projectRef, { forUpdate: true });
      const progressMap = await calculateProjectsProgress(tx, caller, [row.id]);
      const current = toProject(
        row,
        progressMap.get(row.id) ?? {
          total: 0,
          completed: 0,
          percentage: 0,
          byCategory: { backlog: 0, todo: 0, in_progress: 0, done: 0, canceled: 0 },
          estimate: { total: 0, completed: 0 },
        },
      );

      if (input.version !== row.version) {
        throw conflict(`The project is at version ${row.version}, not ${input.version}.`, {
          fields: ["version"],
          current,
        });
      }

      if (input.leadId) {
        await activeMember(tx, orgId, input.leadId);
      }

      const nextSlug = input.slug ? input.slug.toLowerCase().trim() : undefined;
      if (nextSlug && nextSlug !== row.slug) {
        const [clash] = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.orgId, orgId), eq(sql`lower(${projects.slug})`, nextSlug), ne(projects.id, row.id)));
        if (clash) {
          throw conflict(`A project with slug "${nextSlug}" already exists in this organization.`);
        }
      }

      const startDate = input.startDate !== undefined ? (input.startDate ? new Date(input.startDate) : null) : row.startDate;
      const targetDate = input.targetDate !== undefined ? (input.targetDate ? new Date(input.targetDate) : null) : row.targetDate;

      const nextVersion = row.version + 1;
      try {
        const [updated] = await tx
          .update(projects)
          .set({
            name: input.name ?? row.name,
            slug: nextSlug ?? row.slug,
            description: input.description ?? row.description,
            status: input.status ?? row.status,
            leadId: input.leadId !== undefined ? input.leadId : row.leadId,
            startDate,
            targetDate,
            version: nextVersion,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, row.id))
          .returning();

        const updatedProject = toProject(updated!, current.progress);
        await emit(tx, orgId, {
          type: "project.updated",
          actorId: caller.id,
          subjectId: row.id,
          data: { version: nextVersion },
        });
        return updatedProject;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict(`A project with slug "${nextSlug}" already exists in this organization.`);
        }
        throw error;
      }
    });
    return c.json(result, 200);
  });

  app.openapi(deleteProject, async (c) => {
    const { orgId, projectRef } = c.req.valid("param");
    await inOrg(deps, c, orgId, async (tx, caller) => {
      requireAgentPower(caller, "delete", "move a project to the trash");
      requireProjectEditor(caller, "move projects to the trash");
      const row = await visibleProject(tx, caller, projectRef, { forUpdate: true });

      await tx
        .update(projects)
        .set({
          deletedAt: sql`now()`,
          deletedBy: caller.id,
          deletedChangeId: currentChange,
        })
        .where(eq(projects.id, row.id));

      await emit(tx, orgId, {
        type: "project.deleted",
        actorId: caller.id,
        subjectId: row.id,
        data: { name: row.name, slug: row.slug },
      });
    });
    return c.body(null, 204);
  });

  app.openapi(restoreProject, async (c) => {
    const { orgId, projectRef } = c.req.valid("param");
    const restored = await inOrg(deps, c, orgId, async (tx, caller) => {
      requireProjectEditor(caller, "restore projects");
      const row = await visibleProject(tx, caller, projectRef, { forUpdate: true, trashed: true });
      if (!row.deletedAt) {
        const progressMap = await calculateProjectsProgress(tx, caller, [row.id]);
        return toProject(row, progressMap.get(row.id)!);
      }

      await tx
        .update(projects)
        .set({
          deletedAt: null,
          deletedBy: null,
          deletedChangeId: null,
        })
        .where(eq(projects.id, row.id));

      await emit(tx, orgId, {
        type: "project.restored",
        actorId: caller.id,
        subjectId: row.id,
        data: { name: row.name, slug: row.slug },
      });

      const [updated] = await tx.select().from(projects).where(eq(projects.id, row.id));
      const progressMap = await calculateProjectsProgress(tx, caller, [row.id]);
      return toProject(updated!, progressMap.get(row.id)!);
    });
    return c.json(restored, 200);
  });

  app.openapi(listProjectIssues, async (c) => {
    const { orgId, projectRef } = c.req.valid("param");
    const list = await inOrg(deps, c, orgId, async (tx, caller) => {
      const project = await visibleProject(tx, caller, projectRef);
      const rows = await tx
        .select({ issue: issues, key: teams.key })
        .from(issues)
        .innerJoin(teams, eq(teams.id, issues.teamId))
        .where(
          and(
            eq(issues.projectId, project.id),
            isNull(issues.deletedAt),
            teamVisibility(tx, caller),
          ),
        )
        .orderBy(desc(issues.updatedAt));

      const keys = new Map(rows.map((row) => [row.issue.id, row.key]));
      return toIssues(tx, rows.map((row) => row.issue), (row) => keys.get(row.id)!);
    });
    return c.json(list, 200);
  });

  return app;
}
