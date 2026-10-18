// Issue search across the teams the caller can see (ADR 0007): Postgres
// full-text search on titles and descriptions, and trigrams on titles for
// parts of words. The issues.search column is kept out of the Drizzle schema
// (migration 0022), so it is read through sql fragments here.
import { createRoute, z } from "@hono/zod-openapi";
import { and, eq, inArray, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import { issueLabels, issues, statuses, teams } from "@edicthq/db";
import { Id, Issue, Priority, StatusCategory } from "@edicthq/schema";
import { teamVisibility } from "./access.js";
import { errors, inOrg, json, OrgParams, router, type ApiDeps } from "./context.js";
import { issueIdOf, toIssues } from "./issue-data.js";

const SearchQuery = z.object({
  q: z.string().trim().max(200).optional().meta({ description: "Words from the title or description, part of a title, or an identifier like ENG-123" }),
  teamId: Id.optional(),
  statusId: Id.optional(),
  statusCategory: StatusCategory.optional(),
  priority: Priority.optional(),
  assigneeId: Id.optional(),
  delegateId: Id.optional(),
  labelId: Id.optional(),
  include: z.enum(["open", "all"]).default("open").meta({
    description: "open leaves out issues in a Done or Canceled status, unless statusId or statusCategory asks for one",
  }),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const searchIssues = createRoute({
  method: "get",
  path: "/organizations/{orgId}/issues",
  tags: ["Issues"],
  summary: "Search issues across teams",
  description:
    "Every filter narrows the results. With q, the best matches come first; without it, the most pressing, then the most recently updated.",
  request: { params: OrgParams, query: SearchQuery },
  responses: {
    200: json(z.array(Issue), "Matching issues"),
    ...errors("invalid_request", "unauthorized", "not_found"),
  },
});

const identifierLike = /^[A-Za-z][A-Za-z0-9]{1,6}-[1-9][0-9]*$/;

export function searchRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(searchIssues, async (c) => {
    const { orgId } = c.req.valid("param");
    const query = c.req.valid("query");
    const list = await inOrg(deps, c, orgId, async (tx, caller) => {
      const q = query.q || undefined;
      const words = q ? sql`websearch_to_tsquery('english', ${q})` : undefined;
      let match: SQL | undefined;
      if (q) {
        const id = identifierLike.test(q) ? await issueIdOf(tx, orgId, q) : undefined;
        match = or(
          id ? eq(issues.id, id) : undefined,
          sql`issues.search @@ ${words}`,
          sql`${issues.title} ILIKE ${`%${q.replace(/[\\%_]/g, "\\$&")}%`}`,
          sql`${q} <% ${issues.title}`,
        );
      }
      const openOnly = query.include === "open" && !query.statusId && !query.statusCategory;
      const rows = await tx
        .select({ issue: issues, key: teams.key })
        .from(issues)
        .innerJoin(teams, eq(teams.id, issues.teamId))
        .innerJoin(statuses, eq(statuses.id, issues.statusId))
        .where(
          and(
            isNull(issues.deletedAt),
            teamVisibility(tx, caller),
            match,
            query.teamId ? eq(issues.teamId, query.teamId) : undefined,
            query.statusId ? eq(issues.statusId, query.statusId) : undefined,
            query.statusCategory ? eq(statuses.category, query.statusCategory) : undefined,
            query.priority ? eq(issues.priority, query.priority) : undefined,
            query.assigneeId ? eq(issues.assigneeId, query.assigneeId) : undefined,
            query.delegateId ? eq(issues.delegateId, query.delegateId) : undefined,
            query.labelId
              ? inArray(issues.id, tx.select({ id: issueLabels.issueId }).from(issueLabels).where(eq(issueLabels.labelId, query.labelId)))
              : undefined,
            openOnly ? notInArray(statuses.category, ["done", "canceled"]) : undefined,
          ),
        )
        .orderBy(
          ...(q
            ? [sql`ts_rank(issues.search, ${words}) DESC`, sql`word_similarity(${q}, ${issues.title}) DESC`]
            : [issues.priority]),
          sql`${issues.updatedAt} DESC`,
        )
        .limit(query.limit);
      const keys = new Map(rows.map((row) => [row.issue.id, row.key]));
      return toIssues(tx, rows.map((row) => row.issue), (row) => keys.get(row.id)!);
    });
    return c.json(list, 200);
  });

  return app;
}
