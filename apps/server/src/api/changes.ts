import { createRoute } from "@hono/zod-openapi";
import { asc, eq, sql } from "drizzle-orm";
import { comments, emit, events, issueLabels, issueRelations, issues, type Transaction } from "@edicthq/db";
import { Id, UndoResult } from "@edicthq/schema";
import type { Caller } from "./callers.js";
import { visibleTeam } from "./access.js";
import { errors, inOrg, json, OrgParams, router, type ApiDeps } from "./context.js";
import { ApiError, conflict, forbidden, invalid, isUniqueViolation, notFound } from "./errors.js";
import { checkAssignee, checkDelegate, checkLabels, checkParent, checkStatus, labelSet, loadIssue, visibleIssue } from "./issue-data.js";
import { restoreComment, restoreIssues, trashComment, trashIssues } from "./trash.js";

type EventRow = typeof events.$inferSelect;
type FieldChange = { from: unknown; to: unknown };

// Undo applies the inverse of each event of a change, newest first, as a new
// change whose events say which change they undo (ADR 0019). Undoing an undo
// redoes. Anything the change touched that changed since makes the whole undo
// fail with 409, and the transaction rolls back what it had applied.
const inverses: Record<string, (tx: Transaction, caller: Caller, event: EventRow, mark: Mark) => Promise<void>> = {
  "issue.created": async (tx, caller, event, mark) => {
    const issue = await liveIssue(tx, caller, event.subjectId, mark);
    if (issue) await trashIssues(tx, caller, [issue.id], mark.data);
  },
  "issue.restored": async (tx, caller, event, mark) => {
    const issue = await liveIssue(tx, caller, event.subjectId, mark);
    if (issue) await trashIssues(tx, caller, [issue.id], mark.data);
  },
  "issue.deleted": async (tx, caller, event, mark) => {
    const { issue, team } = await visibleIssue(tx, caller, event.subjectId, { forUpdate: true, trashed: true });
    if (issue.deletedChangeId === mark.changeId) return;
    if (issue.deletedChangeId !== event.changeId) {
      throw conflict(`${team.key}-${issue.number} is no longer in the trash from that change.`);
    }
    await restoreIssues(tx, caller, [issue.id], mark.data);
  },
  "issue.updated": (tx, caller, event, mark) => setIssueBack(tx, caller, event, mark),
  "comment.created": async (tx, caller, event, mark) => {
    const row = await commentOf(tx, caller, event.subjectId);
    if (row.deletedChangeId === mark.changeId) return;
    if (row.deletedAt) throw conflict("The comment is already in the trash.");
    await trashComment(tx, caller, row, mark.data);
  },
  "comment.restored": async (tx, caller, event, mark) => {
    const row = await commentOf(tx, caller, event.subjectId);
    if (row.deletedAt) throw conflict("The comment is already in the trash.");
    await trashComment(tx, caller, row, mark.data);
  },
  "comment.deleted": async (tx, caller, event, mark) => {
    const row = await commentOf(tx, caller, event.subjectId);
    if (row.deletedChangeId !== event.changeId) {
      throw conflict("The comment is no longer in the trash from that change.");
    }
    await restoreComment(tx, caller, row, mark.data);
  },
  "comment.updated": async (tx, caller, event, mark) => {
    const row = await commentOf(tx, caller, event.subjectId);
    const data = event.data as { version: number; changes: { body?: FieldChange } };
    if (row.deletedAt || row.version !== data.version || !data.changes.body) {
      throw conflict("The comment changed after that change.", { fields: ["body"] });
    }
    const body = data.changes.body.from as string;
    const [updated] = await tx
      .update(comments)
      .set({ body, version: row.version + 1, updatedAt: new Date() })
      .where(eq(comments.id, row.id))
      .returning();
    await emit(tx, caller.orgId, {
      type: "comment.updated",
      actorId: caller.id,
      subjectId: row.id,
      data: { issueId: row.issueId, version: updated!.version, changes: { body: { from: row.body, to: body } }, ...mark.data },
    });
  },
  "relation.created": async (tx, caller, event, mark) => {
    const [row] = await tx.delete(issueRelations).where(eq(issueRelations.id, event.subjectId)).returning();
    if (!row) throw conflict("The relation was removed after that change.");
    await emit(tx, caller.orgId, {
      type: "relation.deleted",
      actorId: caller.id,
      subjectId: row.id,
      data: { type: row.type, issueId: row.issueId, relatedIssueId: row.relatedIssueId, ...mark.data },
    });
  },
  "relation.deleted": async (tx, caller, event, mark) => {
    const data = event.data as { type: "blocks" | "related" | "duplicate_of"; issueId: string; relatedIssueId: string };
    await visibleIssue(tx, caller, data.issueId);
    await visibleIssue(tx, caller, data.relatedIssueId);
    try {
      await tx.transaction(async (savepoint) => {
        await savepoint.insert(issueRelations).values({ id: event.subjectId, orgId: caller.orgId, creatorId: caller.id, ...data });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("Those issues have that relation again.");
      throw error;
    }
    await emit(tx, caller.orgId, {
      type: "relation.created",
      actorId: caller.id,
      subjectId: event.subjectId,
      data: { type: data.type, issueId: data.issueId, relatedIssueId: data.relatedIssueId, ...mark.data },
    });
  },
};

// The change this undo writes, and what its events carry.
interface Mark {
  changeId: string;
  data: { undoes: string };
}

// An issue that must not be in the trash, unless this same undo put it there
// (a sub-issue goes with its parent).
async function liveIssue(tx: Transaction, caller: Caller, issueId: string, mark: Mark) {
  const { issue, team } = await visibleIssue(tx, caller, issueId, { forUpdate: true, trashed: true });
  if (issue.deletedChangeId === mark.changeId) return undefined;
  if (issue.deletedAt) throw conflict(`${team.key}-${issue.number} is already in the trash.`);
  return issue;
}

async function commentOf(tx: Transaction, caller: Caller, commentId: string) {
  const [row] = await tx.select().from(comments).where(eq(comments.id, commentId)).for("update");
  if (!row) throw conflict("The comment is gone.");
  await visibleIssue(tx, caller, row.issueId);
  return row;
}

// Sets each field an issue.updated event changed back to its old value, if no
// later change touched it: its per-field version is still the event's
// (ADR 0018). A move goes back to the old team and the old number, which
// still names this issue (ADR 0017).
async function setIssueBack(tx: Transaction, caller: Caller, event: EventRow, mark: Mark) {
  const data = event.data as { version: number; changes: Record<string, FieldChange> };
  const { issue: row, team } = await visibleIssue(tx, caller, event.subjectId, { forUpdate: true });
  const current = await loadIssue(tx, row, team);
  const fields = Object.keys(data.changes).filter((field) => field !== "identifier") as (keyof typeof current)[];
  const stale = fields.filter((field) => (row.fieldVersions[field] ?? 1) !== data.version);
  if (stale.length > 0) {
    throw conflict(`${stale.join(", ")} on ${current.identifier} changed after that change, so it can't be undone.`, {
      fields: stale,
      current,
    });
  }

  const next = { ...current, ...Object.fromEntries(fields.map((field) => [field, data.changes[field]!.from])) } as typeof current;
  next.labelIds = labelSet(next.labelIds);
  let target = team;
  let number = row.number;
  if (fields.includes("teamId")) {
    target = await visibleTeam(tx, caller, next.teamId).catch(() => {
      throw conflict("The issue's old team is gone or no longer visible to you.");
    });
    number = Number(String(data.changes.identifier!.from).split("-").pop());
  }
  if (fields.includes("statusId") || fields.includes("teamId")) await checkStatus(tx, target, next.statusId);
  if (fields.includes("labelIds") || fields.includes("teamId")) await checkLabels(tx, target, next.labelIds);
  if (next.assigneeId && (fields.includes("assigneeId") || fields.includes("teamId"))) {
    await checkAssignee(tx, target, next.assigneeId);
  }
  if (next.delegateId && (fields.includes("delegateId") || fields.includes("teamId"))) {
    await checkDelegate(tx, target, next.delegateId);
  }
  if (fields.includes("parentId") && next.parentId) await checkParent(tx, caller, next.parentId, row.id);

  const changes: Record<string, FieldChange> = Object.fromEntries(
    fields.map((field) => [field, { from: current[field], to: next[field] }]),
  );
  if (target.id !== team.id) {
    changes.identifier = { from: current.identifier, to: `${target.key}-${number}` };
  }
  const version = row.version + 1;
  const fieldVersions = { ...row.fieldVersions };
  for (const field of fields) fieldVersions[field] = version;
  await tx
    .update(issues)
    .set({
      title: next.title,
      description: next.description,
      statusId: next.statusId,
      priority: next.priority,
      estimate: next.estimate,
      assigneeId: next.assigneeId,
      delegateId: next.delegateId,
      parentId: next.parentId,
      teamId: target.id,
      number,
      version,
      fieldVersions,
      updatedAt: new Date(),
    })
    .where(eq(issues.id, row.id));
  if (fields.includes("labelIds") || target.id !== team.id) {
    await tx.delete(issueLabels).where(eq(issueLabels.issueId, row.id));
    if (next.labelIds.length) {
      await tx.insert(issueLabels).values(next.labelIds.map((labelId) => ({ orgId: caller.orgId, issueId: row.id, labelId })));
    }
  }
  await emit(tx, caller.orgId, {
    type: "issue.updated",
    actorId: caller.id,
    subjectId: row.id,
    data: { version, changes, ...mark.data },
  });
}

const undoChange = createRoute({
  method: "post",
  path: "/organizations/{orgId}/changes/{changeId}/undo",
  tags: ["Changes"],
  summary: "Undo a change you made",
  description:
    "Every write answers with an Edict-Change-Id header naming its change. Undo sets back everything that change did, as a new change; undo that one to redo. If anything the change touched has changed since, nothing is undone and the response is 409 with the fields.",
  request: { params: OrgParams.extend({ changeId: Id }) },
  responses: {
    200: json(UndoResult, "The change that undid it"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found", "conflict"),
  },
});

export function changeRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(undoChange, async (c) => {
    const { orgId, changeId } = c.req.valid("param");
    const result = await inOrg(deps, c, orgId, async (tx, caller) => {
      const rows = await tx.select().from(events).where(eq(events.changeId, changeId)).orderBy(asc(events.id));
      if (rows.length === 0) {
        throw notFound("change");
      }
      if (rows.some((row) => row.actorId !== caller.id)) {
        throw forbidden("Only the member who made a change can undo it.");
      }
      const unsupported = [...new Set(rows.map((row) => row.type).filter((type) => !inverses[type]))];
      if (unsupported.length > 0) {
        throw invalid(`This change can't be undone: undo does not cover ${unsupported.join(", ")} yet.`);
      }
      const { rows: current } = await tx.execute<{ id: string }>(
        sql`SELECT current_setting('edict.change_id') AS id`,
      );
      const mark: Mark = { changeId: current[0]!.id, data: { undoes: changeId } };
      for (const row of [...rows].reverse()) {
        try {
          await inverses[row.type]!(tx, caller, row, mark);
        } catch (error) {
          // An issue gone to the trash since, or a value no longer valid,
          // means the change can't be set back.
          if (error instanceof ApiError && (error.code === "gone" || error.code === "invalid_request")) {
            throw conflict(`That change can't be undone: ${error.message}`);
          }
          throw error;
        }
      }
      return { changeId: mark.changeId, undoes: changeId };
    });
    return c.json(result, 200);
  });

  return app;
}
