import { createRoute, z } from "@hono/zod-openapi";
import { aliasedTable, and, asc, eq, isNull, or } from "drizzle-orm";
import { emit, issueRelations, issues, statuses, teams } from "@edicthq/db";
import { CreateRelation, Id, IssueRef, Relation, type RelationType } from "@edicthq/schema";
import { teamVisibility, type MemberRow } from "./access.js";
import { body, errors, inOrg, json, noContent, OrgParams, router, type ApiDeps } from "./context.js";
import { conflict, invalid, isUniqueViolation, notFound } from "./errors.js";
import { toLinked, visibleIssue } from "./issue-data.js";
import type { Transaction } from "@edicthq/db";

type RelationRow = typeof issueRelations.$inferSelect;

// How a stored row reads from one of its two issues.
function typeFrom(row: RelationRow, issueId: string): RelationType {
  if (row.type === "related") return "related";
  const outgoing = row.issueId === issueId;
  if (row.type === "blocks") return outgoing ? "blocks" : "blocked_by";
  return outgoing ? "duplicate_of" : "duplicated_by";
}

// A relation as asked for, in the one direction it is stored.
function stored(type: RelationType, issueId: string, otherId: string) {
  switch (type) {
    case "blocks":
      return { type: "blocks" as const, issueId, relatedIssueId: otherId };
    case "blocked_by":
      return { type: "blocks" as const, issueId: otherId, relatedIssueId: issueId };
    case "duplicate_of":
      return { type: "duplicate_of" as const, issueId, relatedIssueId: otherId };
    case "duplicated_by":
      return { type: "duplicate_of" as const, issueId: otherId, relatedIssueId: issueId };
    case "related":
      return issueId < otherId
        ? { type: "related" as const, issueId, relatedIssueId: otherId }
        : { type: "related" as const, issueId: otherId, relatedIssueId: issueId };
  }
}

const other = aliasedTable(issues, "other");

// An issue's relations, each with the other issue, when the caller can see it.
async function relationsOf(tx: Transaction, caller: MemberRow, issueId: string, relationId?: string): Promise<Relation[]> {
  const rows = await tx
    .select({ relation: issueRelations, other, key: teams.key, status: statuses })
    .from(issueRelations)
    .innerJoin(
      other,
      or(
        and(eq(issueRelations.issueId, issueId), eq(other.id, issueRelations.relatedIssueId)),
        and(eq(issueRelations.relatedIssueId, issueId), eq(other.id, issueRelations.issueId)),
      ),
    )
    .innerJoin(teams, eq(teams.id, other.teamId))
    .innerJoin(statuses, eq(statuses.id, other.statusId))
    .where(
      and(relationId ? eq(issueRelations.id, relationId) : undefined, isNull(other.deletedAt), teamVisibility(tx, caller)),
    )
    .orderBy(asc(issueRelations.id));
  return rows.map(({ relation, other, key, status }) => ({
    id: relation.id,
    type: typeFrom(relation, issueId),
    issue: toLinked(other, key, status),
    createdAt: relation.createdAt.toISOString(),
  }));
}

const IssueParams = OrgParams.extend({ issueRef: IssueRef });
const RelationParams = IssueParams.extend({ relationId: Id });

const listRelations = createRoute({
  method: "get",
  path: "/organizations/{orgId}/issues/{issueRef}/relations",
  tags: ["Relations"],
  summary: "An issue's relations, read from that issue",
  description: "Relations to issues in teams the caller cannot see are left out.",
  request: { params: IssueParams },
  responses: { 200: json(z.array(Relation), "Relations, oldest first"), ...errors("unauthorized", "not_found") },
});

const createRelation = createRoute({
  method: "post",
  path: "/organizations/{orgId}/issues/{issueRef}/relations",
  tags: ["Relations"],
  summary: "Relate an issue to another: blocks, blocked by, related, duplicate of",
  request: { params: IssueParams, ...body(CreateRelation) },
  responses: {
    201: json(Relation, "The relation, read from the issue in the path"),
    ...errors("invalid_request", "unauthorized", "not_found", "conflict"),
  },
});

const deleteRelation = createRoute({
  method: "delete",
  path: "/organizations/{orgId}/issues/{issueRef}/relations/{relationId}",
  tags: ["Relations"],
  summary: "Remove a relation",
  request: { params: RelationParams },
  responses: { ...noContent, ...errors("unauthorized", "not_found") },
});

const eventData = (row: RelationRow) => ({ type: row.type, issueId: row.issueId, relatedIssueId: row.relatedIssueId });

export function relationRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(listRelations, async (c) => {
    const { orgId, issueRef } = c.req.valid("param");
    const list = await inOrg(deps, c, orgId, async (tx, caller) => {
      const { issue } = await visibleIssue(tx, caller, issueRef);
      return relationsOf(tx, caller, issue.id);
    });
    return c.json(list, 200);
  });

  app.openapi(createRelation, async (c) => {
    const { orgId, issueRef } = c.req.valid("param");
    const input = c.req.valid("json");
    try {
      const relation = await inOrg(deps, c, orgId, async (tx, caller) => {
        const { issue } = await visibleIssue(tx, caller, issueRef);
        const { issue: target, team } = await visibleIssue(tx, caller, input.issue);
        if (target.id === issue.id) {
          throw invalid("An issue can't be related to itself.");
        }
        const values = stored(input.type, issue.id, target.id);
        if (values.type !== "related") {
          // The opposite direction would contradict this one.
          const [opposite] = await tx
            .select({ id: issueRelations.id })
            .from(issueRelations)
            .where(
              and(
                eq(issueRelations.type, values.type),
                eq(issueRelations.issueId, values.relatedIssueId),
                eq(issueRelations.relatedIssueId, values.issueId),
              ),
            );
          if (opposite) {
            const name = `${team.key}-${target.number}`;
            throw invalid(
              values.type === "blocks"
                ? `The relation already runs the other way: one of these issues blocks the other. Remove it before reversing it (${name}).`
                : `The relation already runs the other way: one of these issues is a duplicate of the other (${name}).`,
            );
          }
        }
        const [row] = await tx.insert(issueRelations).values({ orgId, creatorId: caller.id, ...values }).returning();
        await emit(tx, orgId, { type: "relation.created", actorId: caller.id, subjectId: row!.id, data: eventData(row!) });
        const [relation] = await relationsOf(tx, caller, issue.id, row!.id);
        return relation!;
      });
      return c.json(relation, 201);
    } catch (error) {
      if (isUniqueViolation(error, "issue_relations_pair_unique")) {
        throw conflict("These issues already have that relation.");
      }
      throw error;
    }
  });

  app.openapi(deleteRelation, async (c) => {
    const { orgId, issueRef, relationId } = c.req.valid("param");
    await inOrg(deps, c, orgId, async (tx, caller) => {
      const { issue } = await visibleIssue(tx, caller, issueRef);
      const [shown] = await relationsOf(tx, caller, issue.id, relationId);
      if (!shown) throw notFound("relation");
      const [row] = await tx.delete(issueRelations).where(eq(issueRelations.id, relationId)).returning();
      await emit(tx, orgId, { type: "relation.deleted", actorId: caller.id, subjectId: relationId, data: eventData(row!) });
    });
    return c.body(null, 204);
  });

  return app;
}
