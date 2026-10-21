import { createRoute, z } from "@hono/zod-openapi";
import { and, desc, eq, isNull, notInArray, or, sql } from "drizzle-orm";
import { comments, consumeEvents, emit, issues, progressUpdates, statuses, teams, type EventRow, type ProgressLink, type Transaction } from "@edicthq/db";
import { Issue, IssueRef, PostProgress, ProgressUpdate, type ProgressSource, type ProgressState } from "@edicthq/schema";
import { teamVisibility } from "./access.js";
import { body, errors, inOrg, json, OrgParams, router, type ApiDeps } from "./context.js";
import { forbidden } from "./errors.js";
import { toIssues, toProgress, visibleIssue, type ProgressRow } from "./issue-data.js";

const IssueParams = OrgParams.extend({ issueRef: IssueRef });

const postProgress = createRoute({
  method: "post",
  path: "/organizations/{orgId}/issues/{issueRef}/progress",
  tags: ["Progress"],
  summary: "Post a progress update on an issue",
  description:
    "Agents report how their work on an issue is going: working, blocked, needs input or done, with a markdown message and links such as pull requests. People comment instead. Posting does not change the issue's status. Edict already writes progress when the delegate moves the issue, links a URL or comments (ADR 0029), so agents post mainly when blocked, waiting on a person, or summing up.",
  request: { params: IssueParams, ...body(PostProgress) },
  responses: {
    201: json(ProgressUpdate, "The progress update"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found", "gone"),
  },
});

const listProgress = createRoute({
  method: "get",
  path: "/organizations/{orgId}/issues/{issueRef}/progress",
  tags: ["Progress"],
  summary: "An issue's progress updates, newest first",
  request: {
    params: IssueParams,
    query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }),
  },
  responses: {
    200: json(z.array(ProgressUpdate), "Progress updates"),
    ...errors("unauthorized", "not_found", "gone"),
  },
});

const myWork = createRoute({
  method: "get",
  path: "/organizations/{orgId}/my-work",
  tags: ["Issues"],
  summary: "Issues assigned or delegated to the caller",
  description:
    "An agent's queue: issues delegated to it. For a person, issues assigned to them or delegated to them. Most pressing first. Issues in a Done or Canceled status are left out unless include is all.",
  request: {
    params: OrgParams,
    query: z.object({ include: z.enum(["open", "all"]).default("open") }),
  },
  responses: {
    200: json(z.array(Issue), "Issues by priority, then most recently updated"),
    ...errors("invalid_request", "unauthorized", "not_found"),
  },
});

export function progressRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(postProgress, async (c) => {
    const { orgId, issueRef } = c.req.valid("param");
    const input = c.req.valid("json");
    const created = await inOrg(deps, c, orgId, async (tx, caller) => {
      if (caller.kind !== "agent") {
        throw forbidden("Progress updates come from agents. Comment on the issue instead.");
      }
      const { issue } = await visibleIssue(tx, caller, issueRef);
      return toProgress(await writeProgress(tx, caller.orgId, { issueId: issue.id, agentId: caller.id, source: "agent", ...input }));
    });
    return c.json(created, 201);
  });

  app.openapi(listProgress, async (c) => {
    const { orgId, issueRef } = c.req.valid("param");
    const { limit } = c.req.valid("query");
    const list = await inOrg(deps, c, orgId, async (tx, caller) => {
      const { issue } = await visibleIssue(tx, caller, issueRef);
      const rows = await tx
        .select()
        .from(progressUpdates)
        .where(eq(progressUpdates.issueId, issue.id))
        .orderBy(desc(progressUpdates.id))
        .limit(limit);
      return rows.map(toProgress);
    });
    return c.json(list, 200);
  });

  app.openapi(myWork, async (c) => {
    const { orgId } = c.req.valid("param");
    const { include } = c.req.valid("query");
    const list = await inOrg(deps, c, orgId, async (tx, caller) => {
      const mine = caller.kind === "agent" ? eq(issues.delegateId, caller.id) : or(eq(issues.assigneeId, caller.id), eq(issues.delegateId, caller.id));
      const rows = await tx
        .select({ issue: issues, key: teams.key })
        .from(issues)
        .innerJoin(teams, eq(teams.id, issues.teamId))
        .innerJoin(statuses, eq(statuses.id, issues.statusId))
        .where(
          and(
            mine,
            isNull(issues.deletedAt),
            teamVisibility(tx, caller),
            include === "open" ? notInArray(statuses.category, ["done", "canceled"]) : undefined,
          ),
        )
        .orderBy(issues.priority, sql`${issues.updatedAt} DESC`);
      const keys = new Map(rows.map((row) => [row.issue.id, row.key]));
      return toIssues(tx, rows.map((row) => row.issue), (row) => keys.get(row.id)!);
    });
    return c.json(list, 200);
  });

  return app;
}

// Writes a progress update and its event in the caller's change.
export async function writeProgress(
  tx: Transaction,
  orgId: string,
  update: { issueId: string; agentId: string; source: ProgressSource; state: ProgressState; message: string; links?: ProgressLink[] },
): Promise<ProgressRow> {
  const [row] = await tx
    .insert(progressUpdates)
    .values({ orgId, issueId: update.issueId, agentId: update.agentId, source: update.source, state: update.state, message: update.message, links: update.links ?? [] })
    .returning();
  await emit(tx, orgId, {
    type: "progress.posted",
    actorId: update.agentId,
    subjectId: row!.id,
    data: { issueId: update.issueId, state: update.state, source: update.source },
  });
  return row!;
}

// The agent's newest progress update on an issue.
export async function latestByAgent(tx: Transaction, issueId: string, agentId: string): Promise<ProgressRow | undefined> {
  const [row] = await tx
    .select()
    .from(progressUpdates)
    .where(and(eq(progressUpdates.issueId, issueId), eq(progressUpdates.agentId, agentId)))
    .orderBy(desc(progressUpdates.id))
    .limit(1);
  return row;
}

// A link or comment keeps a question open: the agent often asks it in a
// comment. Anything else says working.
export function carriedState(latest: ProgressRow | undefined): ProgressState {
  return latest?.state === "blocked" || latest?.state === "needs_input" ? latest.state : "working";
}

const MESSAGE_LINE = 200;

// The first line of a markdown text, short enough for the lane.
function firstLine(text: string): string {
  const line = text.split("\n").map((part) => part.trim()).find(Boolean) ?? "";
  return line.length > MESSAGE_LINE ? `${line.slice(0, MESSAGE_LINE - 1)}…` : line;
}

type Changes = Record<string, { from: unknown; to: unknown } | undefined>;

// ADR 0029: what the delegate does on its issue is progress. The status move,
// link or comment writes an activity update in its own change. Undoing a
// change writes none.
async function activityFromEvent(tx: Transaction, event: EventRow): Promise<void> {
  const data = event.data as Record<string, unknown>;
  if (data.undoes) return;
  let issueId: string;
  if (event.type === "issue.updated" && (data.changes as Changes | undefined)?.statusId) {
    issueId = event.subjectId;
  } else if ((event.type === "link.created" || event.type === "comment.created") && typeof data.issueId === "string") {
    issueId = data.issueId;
  } else {
    return;
  }
  const [issue] = await tx.select({ delegateId: issues.delegateId, closedAt: issues.closedAt }).from(issues).where(eq(issues.id, issueId));
  if (!issue || issue.delegateId !== event.actorId) return;
  const agentId = event.actorId;
  const source: ProgressSource = data.via === "hook" ? "hook" : "activity";

  if (event.type === "issue.updated") {
    const to = (data.changes as Changes).statusId!.to as string;
    const [status] = await tx.select({ name: statuses.name, category: statuses.category }).from(statuses).where(eq(statuses.id, to));
    if (!status) return;
    const closed = status.category === "done" || status.category === "canceled";
    await writeProgress(tx, event.orgId, { issueId, agentId, source, state: closed ? "done" : "working", message: `Moved to ${status.name}` });
    return;
  }
  // A word on a closed issue does not reopen the work.
  const state = issue.closedAt ? "done" : carriedState(await latestByAgent(tx, issueId, agentId));
  if (event.type === "link.created") {
    const url = data.url as string;
    const title = typeof data.title === "string" && data.title ? data.title : undefined;
    await writeProgress(tx, event.orgId, {
      issueId,
      agentId,
      source,
      state,
      message: `Linked ${title ?? url}`,
      links: [title ? { url, title } : { url }],
    });
    return;
  }
  const [comment] = await tx.select({ body: comments.body }).from(comments).where(eq(comments.id, event.subjectId));
  const message = firstLine(comment?.body ?? "");
  if (!message) return;
  await writeProgress(tx, event.orgId, { issueId, agentId, source, state, message });
}

consumeEvents(activityFromEvent);
