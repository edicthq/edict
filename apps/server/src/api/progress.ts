import { createRoute, z } from "@hono/zod-openapi";
import { and, desc, eq, isNull, notInArray, or, sql } from "drizzle-orm";
import { emit, issues, progressUpdates, statuses, teams } from "@edicthq/db";
import { Issue, IssueRef, PostProgress, ProgressUpdate } from "@edicthq/schema";
import { teamVisibility } from "./access.js";
import { body, errors, inOrg, json, OrgParams, router, type ApiDeps } from "./context.js";
import { forbidden } from "./errors.js";
import { toIssues, toProgress, visibleIssue } from "./issue-data.js";

const IssueParams = OrgParams.extend({ issueRef: IssueRef });

const postProgress = createRoute({
  method: "post",
  path: "/organizations/{orgId}/issues/{issueRef}/progress",
  tags: ["Progress"],
  summary: "Post a progress update on an issue",
  description:
    "Agents report how their work on an issue is going: working, blocked, needs input or done, with a markdown message and links such as pull requests. People comment instead. Posting does not change the issue's status.",
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
      const [row] = await tx
        .insert(progressUpdates)
        .values({ orgId, issueId: issue.id, agentId: caller.id, state: input.state, message: input.message, links: input.links })
        .returning();
      await emit(tx, orgId, {
        type: "progress.posted",
        actorId: caller.id,
        subjectId: row!.id,
        data: { issueId: issue.id, state: input.state },
      });
      return toProgress(row!);
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
