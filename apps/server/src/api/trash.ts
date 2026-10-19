import { createRoute, z } from "@hono/zod-openapi";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { comments, emit, issues, projects, teams, type Transaction } from "@edicthq/db";
import { BulkDeleteIssues, Comment, Id, Issue, IssueRef, TrashedIssue, TrashedProject } from "@edicthq/schema";
import type { Caller } from "./callers.js";
import { atLeast, requireAgentPower, teamVisibility } from "./access.js";
import { toComment } from "./comments.js";
import { body, errors, inOrg, json, noContent, OrgParams, router, type ApiDeps } from "./context.js";
import { conflict, forbidden, notFound } from "./errors.js";
import { loadIssue, visibleIssue } from "./issue-data.js";
import { requireProjectEditor } from "./projects.js";

type CommentRow = typeof comments.$inferSelect;

// The change the running scope writes (ADR 0019). Rows one change trashes
// share it, so they come back together.
const currentChange = sql`nullif(current_setting('edict.change_id', true), '')::uuid`;

// Trashes issues and their sub-issues, however deep, that are not already in
// the trash. Comments and attachments stay as they are: they hide with their
// issue and come back with it. One issue.deleted event per issue.
// `extra` joins each event's data; undo marks its events with it.
type Extra = Record<string, unknown>;

export async function trashIssues(tx: Transaction, caller: Caller, rootIds: string[], extra: Extra = {}): Promise<void> {
  if (rootIds.length === 0) return;
  const { rows } = await tx.execute<{ id: string }>(sql`
    WITH RECURSIVE tree(id) AS (
      SELECT id FROM issues WHERE id IN (${sql.join(rootIds.map((id) => sql`${id}::uuid`), sql`, `)}) AND deleted_at IS NULL
      UNION
      SELECT i.id FROM issues i JOIN tree t ON i.parent_id = t.id WHERE i.deleted_at IS NULL
    )
    SELECT id FROM tree`);
  if (rows.length === 0) return;
  const trashed = await tx
    .update(issues)
    .set({ deletedAt: sql`now()`, deletedBy: caller.id, deletedChangeId: currentChange })
    .where(inArray(issues.id, rows.map((row) => row.id)))
    .returning();
  await emitEach(tx, caller, "issue.deleted", trashed, extra);
}

// Takes issues out of the trash. One issue.restored event per issue.
export async function restoreIssues(tx: Transaction, caller: Caller, ids: string[], extra: Extra = {}): Promise<void> {
  if (ids.length === 0) return;
  const before = await tx.select().from(issues).where(and(inArray(issues.id, ids), isNotNull(issues.deletedAt)));
  if (before.length === 0) return;
  await tx
    .update(issues)
    .set({ deletedAt: null, deletedBy: null, deletedChangeId: null })
    .where(inArray(issues.id, before.map((row) => row.id)));
  await emitEach(tx, caller, "issue.restored", before, extra);
}

async function emitEach(
  tx: Transaction,
  caller: Caller,
  type: "issue.deleted" | "issue.restored",
  rows: (typeof issues.$inferSelect)[],
  extra: Extra,
) {
  const keys = await tx
    .select({ id: teams.id, key: teams.key })
    .from(teams)
    .where(inArray(teams.id, [...new Set(rows.map((row) => row.teamId))]));
  const keyOf = new Map(keys.map((team) => [team.id, team.key]));
  for (const row of [...rows].sort((a, b) => a.number - b.number)) {
    await emit(tx, caller.orgId, {
      type,
      actorId: caller.id,
      subjectId: row.id,
      data: {
        identifier: `${keyOf.get(row.teamId)}-${row.number}`,
        title: row.title,
        // A restore names the change that trashed the issue.
        ...(type === "issue.restored" ? { deletedChangeId: row.deletedChangeId } : {}),
        ...extra,
      },
    });
  }
}

export async function trashComment(tx: Transaction, caller: Caller, row: CommentRow, extra: Extra = {}): Promise<void> {
  await tx
    .update(comments)
    .set({ deletedAt: sql`now()`, deletedBy: caller.id, deletedChangeId: currentChange })
    .where(eq(comments.id, row.id));
  await emit(tx, caller.orgId, { type: "comment.deleted", actorId: caller.id, subjectId: row.id, data: { issueId: row.issueId, ...extra } });
}

export async function restoreComment(tx: Transaction, caller: Caller, row: CommentRow, extra: Extra = {}): Promise<CommentRow> {
  const [restored] = await tx
    .update(comments)
    .set({ deletedAt: null, deletedBy: null, deletedChangeId: null })
    .where(eq(comments.id, row.id))
    .returning();
  await emit(tx, caller.orgId, {
    type: "comment.restored",
    actorId: caller.id,
    subjectId: row.id,
    data: { issueId: row.issueId, deletedChangeId: row.deletedChangeId, ...extra },
  });
  return restored!;
}

// A comment the caller may trash or restore: theirs, or any if they are an
// Admin or Owner, on an issue they can see.
async function managedComment(tx: Transaction, caller: Caller, commentId: string): Promise<CommentRow> {
  const [row] = await tx.select().from(comments).where(eq(comments.id, commentId)).for("update");
  if (!row) {
    throw notFound("comment");
  }
  await visibleIssue(tx, caller, row.issueId);
  if (row.creatorId !== caller.id && !atLeast(caller.role, "admin")) {
    throw forbidden("Only the comment's creator, or an Admin or Owner, can delete or restore it.");
  }
  return row;
}

const IssueParams = OrgParams.extend({ issueRef: IssueRef });
const CommentParams = OrgParams.extend({ commentId: Id });

const deleteIssue = createRoute({
  method: "delete",
  path: "/organizations/{orgId}/issues/{issueRef}",
  tags: ["Trash"],
  summary: "Move an issue and its sub-issues to the trash",
  description:
    "Trashed issues leave every list and answer 410 until restored. The trash keeps them for 30 days. The Edict-Change-Id response header names the change, for undo.",
  request: { params: IssueParams },
  responses: { ...noContent, ...errors("unauthorized", "not_found", "gone") },
});

const bulkDeleteIssues = createRoute({
  method: "post",
  path: "/organizations/{orgId}/issues/bulk-delete",
  tags: ["Trash"],
  summary: "Move multiple issues and their sub-issues to the trash",
  description:
    "Trashed issues leave every list and answer 410 until restored. The trash keeps them for 30 days. The Edict-Change-Id response header names the change, for undo.",
  request: { params: OrgParams, ...body(BulkDeleteIssues) },
  responses: { ...noContent, ...errors("invalid_request", "unauthorized", "not_found") },
});

const restoreIssue = createRoute({
  method: "post",
  path: "/organizations/{orgId}/issues/{issueRef}/restore",
  tags: ["Trash"],
  summary: "Bring an issue back from the trash",
  description: "Everything the same delete trashed comes back with it, such as its sub-issues.",
  request: { params: IssueParams },
  responses: {
    200: json(Issue, "The restored issue"),
    ...errors("unauthorized", "not_found", "conflict"),
  },
});

const listTrash = createRoute({
  method: "get",
  path: "/organizations/{orgId}/trash",
  tags: ["Trash"],
  summary: "Trashed issues in teams the caller can see, most recently deleted first",
  request: { params: OrgParams },
  responses: { 200: json(z.array(TrashedIssue), "Trashed issues"), ...errors("unauthorized", "not_found") },
});

const listTrashedProjects = createRoute({
  method: "get",
  path: "/organizations/{orgId}/trash/projects",
  tags: ["Trash"],
  summary: "Trashed projects in the organization, most recently deleted first",
  request: { params: OrgParams },
  responses: { 200: json(z.array(TrashedProject), "Trashed projects"), ...errors("unauthorized", "not_found") },
});

const deleteComment = createRoute({
  method: "delete",
  path: "/organizations/{orgId}/comments/{commentId}",
  tags: ["Trash"],
  summary: "Move a comment to the trash",
  description: "Its creator, or an Admin or Owner, can delete a comment.",
  request: { params: CommentParams },
  responses: { ...noContent, ...errors("unauthorized", "forbidden", "not_found", "gone", "conflict") },
});

const restoreCommentRoute = createRoute({
  method: "post",
  path: "/organizations/{orgId}/comments/{commentId}/restore",
  tags: ["Trash"],
  summary: "Bring a comment back from the trash",
  request: { params: CommentParams },
  responses: {
    200: json(Comment, "The restored comment"),
    ...errors("unauthorized", "forbidden", "not_found", "gone", "conflict"),
  },
});

export function trashRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(deleteIssue, async (c) => {
    const { orgId, issueRef } = c.req.valid("param");
    await inOrg(deps, c, orgId, async (tx, caller) => {
      requireAgentPower(caller, "delete", "delete issues");
      const { issue } = await visibleIssue(tx, caller, issueRef, { forUpdate: true });
      await trashIssues(tx, caller, [issue.id]);
    });
    return c.body(null, 204);
  });

  app.openapi(bulkDeleteIssues, async (c) => {
    const { orgId } = c.req.valid("param");
    const { issueIds } = c.req.valid("json");
    await inOrg(deps, c, orgId, async (tx, caller) => {
      requireAgentPower(caller, "delete", "delete issues");
      const rootIds: string[] = [];
      for (const id of issueIds) {
        const { issue } = await visibleIssue(tx, caller, id, { forUpdate: true });
        rootIds.push(issue.id);
      }
      await trashIssues(tx, caller, rootIds);
    });
    return c.body(null, 204);
  });

  app.openapi(restoreIssue, async (c) => {
    const { orgId, issueRef } = c.req.valid("param");
    const restored = await inOrg(deps, c, orgId, async (tx, caller) => {
      const { issue, team } = await visibleIssue(tx, caller, issueRef, { forUpdate: true, trashed: true });
      if (!issue.deletedChangeId) {
        throw conflict(`${team.key}-${issue.number} is not in the trash.`);
      }
      const group = await tx
        .select({ id: issues.id })
        .from(issues)
        .where(eq(issues.deletedChangeId, issue.deletedChangeId));
      await restoreIssues(tx, caller, group.map((row) => row.id));
      const { issue: row } = await visibleIssue(tx, caller, issue.id);
      return loadIssue(tx, row, team);
    });
    return c.json(restored, 200);
  });

  app.openapi(listTrash, async (c) => {
    const { orgId } = c.req.valid("param");
    const list = await inOrg(deps, c, orgId, async (tx, caller) => {
      const rows = await tx
        .select({ issue: issues, key: teams.key })
        .from(issues)
        .innerJoin(teams, eq(teams.id, issues.teamId))
        .where(and(isNotNull(issues.deletedAt), teamVisibility(tx, caller)))
        .orderBy(desc(issues.deletedAt), asc(issues.number));
      return rows.map(({ issue, key }) => ({
        id: issue.id,
        identifier: `${key}-${issue.number}`,
        title: issue.title,
        teamId: issue.teamId,
        deletedAt: issue.deletedAt!.toISOString(),
        deletedById: issue.deletedBy!,
        changeId: issue.deletedChangeId!,
      }));
    });
    return c.json(list, 200);
  });

  app.openapi(listTrashedProjects, async (c) => {
    const { orgId } = c.req.valid("param");
    const list = await inOrg(deps, c, orgId, async (tx, caller) => {
      requireProjectEditor(caller, "see trashed projects");
      const rows = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.orgId, orgId), isNotNull(projects.deletedAt)))
        .orderBy(desc(projects.deletedAt));
      return rows.map((project) => ({
        id: project.id,
        name: project.name,
        slug: project.slug,
        deletedAt: project.deletedAt!.toISOString(),
        deletedById: project.deletedBy!,
        changeId: project.deletedChangeId!,
      }));
    });
    return c.json(list, 200);
  });

  app.openapi(deleteComment, async (c) => {
    const { orgId, commentId } = c.req.valid("param");
    await inOrg(deps, c, orgId, async (tx, caller) => {
      requireAgentPower(caller, "delete", "delete comments");
      const row = await managedComment(tx, caller, commentId);
      if (row.deletedAt) {
        throw conflict("The comment is already in the trash.");
      }
      await trashComment(tx, caller, row);
    });
    return c.body(null, 204);
  });

  app.openapi(restoreCommentRoute, async (c) => {
    const { orgId, commentId } = c.req.valid("param");
    const restored = await inOrg(deps, c, orgId, async (tx, caller) => {
      const row = await managedComment(tx, caller, commentId);
      if (!row.deletedAt) {
        throw conflict("The comment is not in the trash.");
      }
      return toComment(await restoreComment(tx, caller, row));
    });
    return c.json(restored, 200);
  });

  return app;
}
