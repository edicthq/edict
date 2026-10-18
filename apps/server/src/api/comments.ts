import { createRoute, z } from "@hono/zod-openapi";
import { and, asc, eq, isNull } from "drizzle-orm";
import { comments, emit } from "@edicthq/db";
import { Comment, CommentConflict, CreateComment, Id, IssueRef, UpdateComment } from "@edicthq/schema";
import type { Caller } from "./callers.js";
import { body, errors, inOrg, json, OrgParams, router, type ApiDeps } from "./context.js";
import { changesOf, conflict, forbidden, notFound } from "./errors.js";
import { visibleIssue } from "./issue-data.js";
import type { Transaction } from "@edicthq/db";

type CommentRow = typeof comments.$inferSelect;

export function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    issueId: row.issueId,
    creatorId: row.creatorId,
    body: row.body,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// A comment the caller edits: on an issue they can still see, and theirs.
// Locks the row, so two edits of one version cannot both pass.
async function editableComment(tx: Transaction, caller: Caller, commentId: string): Promise<CommentRow> {
  const [row] = await tx.select().from(comments).where(eq(comments.id, commentId)).for("update");
  if (!row || row.deletedAt) {
    throw notFound("comment");
  }
  await visibleIssue(tx, caller, row.issueId);
  if (row.creatorId !== caller.id) {
    throw forbidden("Only the comment's creator can edit it.");
  }
  return row;
}

const IssueParams = OrgParams.extend({ issueRef: IssueRef });
const CommentParams = OrgParams.extend({ commentId: Id });

const listComments = createRoute({
  method: "get",
  path: "/organizations/{orgId}/issues/{issueRef}/comments",
  tags: ["Comments"],
  summary: "An issue's comments",
  description: "Markdown (ADR 0009), oldest first.",
  request: { params: IssueParams },
  responses: { 200: json(z.array(Comment), "The comments, oldest first"), ...errors("unauthorized", "not_found") },
});

const createComment = createRoute({
  method: "post",
  path: "/organizations/{orgId}/issues/{issueRef}/comments",
  tags: ["Comments"],
  summary: "Comment on an issue",
  description: "The body is markdown (ADR 0009). Agents also add records through MCP; this route is the API's.",
  request: { params: IssueParams, ...body(CreateComment) },
  responses: { 201: json(Comment, "The new comment"), ...errors("invalid_request", "unauthorized", "not_found") },
});

const updateComment = createRoute({
  method: "patch",
  path: "/organizations/{orgId}/comments/{commentId}",
  tags: ["Comments"],
  summary: "Edit your comment",
  description:
    "Only its creator edits a comment. It compares the whole version (ADR 0018): send the version you read, and a conflict response carries the current comment.",
  request: { params: CommentParams, ...body(UpdateComment) },
  responses: {
    200: json(Comment, "The edited comment"),
    409: json(CommentConflict, "The comment changed after the version it sent; `current` carries it"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found"),
  },
});

export function commentRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(listComments, async (c) => {
    const { orgId, issueRef } = c.req.valid("param");
    const list = await inOrg(deps, c, orgId, async (tx, caller) => {
      const { issue } = await visibleIssue(tx, caller, issueRef);
      const rows = await tx
        .select()
        .from(comments)
        .where(and(eq(comments.issueId, issue.id), isNull(comments.deletedAt)))
        .orderBy(asc(comments.id));
      return rows.map(toComment);
    });
    return c.json(list, 200);
  });

  app.openapi(createComment, async (c) => {
    const { orgId, issueRef } = c.req.valid("param");
    const input = c.req.valid("json");
    const created = await inOrg(deps, c, orgId, async (tx, caller) => {
      const { issue } = await visibleIssue(tx, caller, issueRef);
      const [row] = await tx.insert(comments).values({ orgId, issueId: issue.id, creatorId: caller.id, body: input.body }).returning();
      await emit(tx, orgId, { type: "comment.created", actorId: caller.id, subjectId: row!.id, data: { issueId: issue.id, version: 1 } });
      return toComment(row!);
    });
    return c.json(created, 201);
  });

  app.openapi(updateComment, async (c) => {
    const { orgId, commentId } = c.req.valid("param");
    const input = c.req.valid("json");
    const edited = await inOrg(deps, c, orgId, async (tx, caller) => {
      const row = await editableComment(tx, caller, commentId);
      const current = toComment(row);
      if (input.version !== row.version) {
        throw conflict(
          `The comment is at version ${row.version}, not ${input.version}. Read it again and retry.`,
          { current },
        );
      }
      const [updated] = await tx
        .update(comments)
        .set({ body: input.body, version: row.version + 1, updatedAt: new Date() })
        .where(eq(comments.id, commentId))
        .returning();
      await emit(tx, orgId, {
        type: "comment.updated",
        actorId: caller.id,
        subjectId: commentId,
        data: { issueId: row.issueId, version: updated!.version, changes: changesOf(row, input) },
      });
      return toComment(updated!);
    });
    return c.json(edited, 200);
  });

  return app;
}
