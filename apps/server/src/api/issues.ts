import { createRoute, z } from "@hono/zod-openapi";
import { and, desc, eq, sql } from "drizzle-orm";
import { emit, issueNumbers, issues, statuses, teamKeys, teams, type Transaction } from "@edicthq/db";
import { CreateIssue, Id, Issue, IssueConflict, IssueRef, UpdateIssue } from "@edicthq/schema";
import { activeMember, canSeeTeam, teamVisibility, visibleTeam, type MemberRow, type TeamRow } from "./access.js";
import { body, errors, inOrg, json, OrgParams, router, type ApiDeps } from "./context.js";
import { changesOf, conflict, invalid, notFound } from "./errors.js";

type IssueRow = typeof issues.$inferSelect;

export function toIssue(row: IssueRow, teamKey: string): Issue {
  return {
    id: row.id,
    identifier: `${teamKey}-${row.number}`,
    number: row.number,
    teamId: row.teamId,
    title: row.title,
    description: row.description,
    statusId: row.statusId,
    priority: row.priority,
    estimate: row.estimate,
    assigneeId: row.assigneeId,
    creatorId: row.creatorId,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identifierPattern = /^([A-Z][A-Z0-9]{1,6})-([1-9][0-9]{0,8})$/;

// The id of the issue a reference names: its UUID, or any identifier it has
// had, through the key and number history (ADR 0017).
async function issueIdOf(tx: Transaction, orgId: string, ref: string): Promise<string | undefined> {
  if (uuidPattern.test(ref)) {
    return ref;
  }
  const match = identifierPattern.exec(ref.toUpperCase());
  if (!match) {
    return undefined;
  }
  const [row] = await tx
    .select({ issueId: issueNumbers.issueId })
    .from(teamKeys)
    .innerJoin(issueNumbers, eq(issueNumbers.teamId, teamKeys.teamId))
    .where(and(eq(teamKeys.orgId, orgId), eq(teamKeys.key, match[1]!), eq(issueNumbers.number, Number(match[2]))));
  return row?.issueId;
}

// The issue a reference names, with its team's current key, if the caller can
// see its team. Locks the issue row when updating.
async function visibleIssue(
  tx: Transaction,
  caller: MemberRow,
  ref: string,
  options: { forUpdate?: boolean } = {},
): Promise<{ issue: IssueRow; team: TeamRow }> {
  const issueId = await issueIdOf(tx, caller.orgId, ref);
  if (issueId) {
    const query = tx
      .select({ issue: issues, team: teams })
      .from(issues)
      .innerJoin(teams, eq(teams.id, issues.teamId))
      .where(and(eq(issues.orgId, caller.orgId), eq(issues.id, issueId), teamVisibility(tx, caller)));
    const [row] = await (options.forUpdate ? query.for("update", { of: issues }) : query);
    if (row) {
      return row;
    }
  }
  throw notFound("issue");
}

async function checkStatus(tx: Transaction, team: TeamRow, statusId: string): Promise<void> {
  const [status] = await tx
    .select({ id: statuses.id })
    .from(statuses)
    .where(and(eq(statuses.teamId, team.id), eq(statuses.id, statusId)));
  if (!status) {
    throw invalid(`statusId is not a status of team ${team.key}. GET the team's statuses for the valid ones.`);
  }
}

// The assignee answers for the issue, so it is a human who can see its team.
async function checkAssignee(tx: Transaction, team: TeamRow, assigneeId: string): Promise<void> {
  const assignee = await activeMember(tx, team.orgId, assigneeId).catch(() => undefined);
  if (!assignee || assignee.kind !== "human" || !(await canSeeTeam(tx, assignee, team))) {
    throw invalid(`The assignee must be a human member who can see team ${team.key}.`);
  }
}

const TeamParams = OrgParams.extend({ teamId: Id });
const IssueParams = OrgParams.extend({ issueRef: IssueRef });

const createIssue = createRoute({
  method: "post",
  path: "/organizations/{orgId}/teams/{teamId}/issues",
  tags: ["Issues"],
  summary: "Create an issue in a team",
  description: "The issue takes the team's next number. Without a status it starts in the team's default status.",
  request: { params: TeamParams, ...body(CreateIssue) },
  responses: {
    201: json(Issue, "The new issue"),
    ...errors("invalid_request", "unauthorized", "not_found"),
  },
});

const listIssues = createRoute({
  method: "get",
  path: "/organizations/{orgId}/teams/{teamId}/issues",
  tags: ["Issues"],
  summary: "A team's issues, newest first",
  request: { params: TeamParams },
  responses: {
    200: json(z.array(Issue), "Issues by number, highest first"),
    ...errors("unauthorized", "not_found"),
  },
});

const getIssue = createRoute({
  method: "get",
  path: "/organizations/{orgId}/issues/{issueRef}",
  tags: ["Issues"],
  summary: "One issue, by id or by any identifier it has had",
  description: "An old identifier still finds the issue. The response carries its current identifier.",
  request: { params: IssueParams },
  responses: {
    200: json(Issue, "The issue"),
    ...errors("unauthorized", "not_found"),
  },
});

const updateIssue = createRoute({
  method: "patch",
  path: "/organizations/{orgId}/issues/{issueRef}",
  tags: ["Issues"],
  summary: "Change an issue's fields",
  description:
    "Send the version you read and only the fields to change. If any of those fields changed after that version, the update is refused with 409 and the current issue: read it again and retry. Changes to other fields since then do not conflict.",
  request: { params: IssueParams, ...body(UpdateIssue) },
  responses: {
    200: json(Issue, "The issue"),
    409: json(IssueConflict, "Fields in the request changed after the version it sent"),
    ...errors("invalid_request", "unauthorized", "not_found"),
  },
});

export function issueRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(createIssue, async (c) => {
    const { orgId, teamId } = c.req.valid("param");
    const input = c.req.valid("json");
    const issue = await inOrg(deps, c, orgId, async (tx, caller) => {
      const team = await visibleTeam(tx, caller, teamId);
      let statusId = input.statusId;
      if (statusId) {
        await checkStatus(tx, team, statusId);
      } else {
        const [fallback] = await tx
          .select({ id: statuses.id })
          .from(statuses)
          .where(and(eq(statuses.teamId, teamId), eq(statuses.isDefault, true)));
        statusId = fallback!.id;
      }
      if (input.assigneeId) {
        await checkAssignee(tx, team, input.assigneeId);
      }

      // Locks the team's counter until commit, so concurrent creations in one
      // team take turns and never share a number.
      const [counter] = await tx
        .update(teams)
        .set({ issueCounter: sql`${teams.issueCounter} + 1` })
        .where(eq(teams.id, teamId))
        .returning({ number: teams.issueCounter, key: teams.key });
      const [issue] = await tx
        .insert(issues)
        .values({ ...input, orgId, teamId, statusId, number: counter!.number, creatorId: caller.id })
        .returning();
      await tx.insert(issueNumbers).values({ orgId, teamId, number: issue!.number, issueId: issue!.id });

      const created = toIssue(issue!, counter!.key);
      await emit(tx, orgId, {
        type: "issue.created",
        actorId: caller.id,
        subjectId: issue!.id,
        data: {
          identifier: created.identifier,
          teamId,
          title: created.title,
          description: created.description,
          statusId: created.statusId,
          priority: created.priority,
          estimate: created.estimate,
          assigneeId: created.assigneeId,
        },
      });
      return created;
    });
    return c.json(issue, 201);
  });

  app.openapi(listIssues, async (c) => {
    const { orgId, teamId } = c.req.valid("param");
    const list = await inOrg(deps, c, orgId, async (tx, caller) => {
      const team = await visibleTeam(tx, caller, teamId);
      const rows = await tx.select().from(issues).where(eq(issues.teamId, teamId)).orderBy(desc(issues.number));
      return rows.map((row) => toIssue(row, team.key));
    });
    return c.json(list, 200);
  });

  app.openapi(getIssue, async (c) => {
    const { orgId, issueRef } = c.req.valid("param");
    const issue = await inOrg(deps, c, orgId, async (tx, caller) => {
      const { issue, team } = await visibleIssue(tx, caller, issueRef);
      return toIssue(issue, team.key);
    });
    return c.json(issue, 200);
  });

  app.openapi(updateIssue, async (c) => {
    const { orgId, issueRef } = c.req.valid("param");
    const { version, ...fields } = c.req.valid("json");
    const issue = await inOrg(deps, c, orgId, async (tx, caller) => {
      const { issue: current, team } = await visibleIssue(tx, caller, issueRef, { forUpdate: true });
      const changes = changesOf(toIssue(current, team.key), fields);
      const changed = Object.keys(changes) as (keyof typeof fields)[];

      // ADR 0018: stale only if a field this request changes was changed
      // after the version it read.
      const stale = changed.filter((field) => (current.fieldVersions[field] ?? 1) > version);
      if (version > current.version || stale.length > 0) {
        throw conflict(
          version > current.version
            ? `The issue is at version ${current.version}, not ${version}.`
            : `${stale.join(", ")} changed after version ${version}. Read the issue again and retry.`,
          { fields: stale, current: toIssue(current, team.key) },
        );
      }
      if (changed.length === 0) {
        return toIssue(current, team.key);
      }
      if (changes.statusId) {
        await checkStatus(tx, team, fields.statusId!);
      }
      if (changes.assigneeId && fields.assigneeId) {
        await checkAssignee(tx, team, fields.assigneeId);
      }

      const next = current.version + 1;
      const fieldVersions = { ...current.fieldVersions };
      const values: Partial<typeof fields> = {};
      for (const field of changed) {
        fieldVersions[field] = next;
        Object.assign(values, { [field]: fields[field] });
      }
      const [updated] = await tx
        .update(issues)
        .set({ ...values, version: next, fieldVersions, updatedAt: new Date() })
        .where(eq(issues.id, current.id))
        .returning();
      await emit(tx, orgId, {
        type: "issue.updated",
        actorId: caller.id,
        subjectId: current.id,
        data: { version: next, changes },
      });
      return toIssue(updated!, team.key);
    });
    return c.json(issue, 200);
  });

  return app;
}
