import { createRoute, z } from "@hono/zod-openapi";
import { and, desc, eq, isNull } from "drizzle-orm";
import { emit, issueLabels, issueNumbers, issues, statuses } from "@edicthq/db";
import { CreateIssue, Id, Issue, IssueConflict, IssueRef, LinkedIssue, UpdateIssue } from "@edicthq/schema";
import { visibleTeam } from "./access.js";
import { body, errors, inOrg, json, OrgParams, router, type ApiDeps } from "./context.js";
import { changesOf, conflict, invalid } from "./errors.js";
import {
  checkAssignee,
  checkDelegate,
  checkLabels,
  checkParent,
  checkStatus,
  labelSet,
  linkedIssues,
  loadIssue,
  mapStatus,
  nextNumber,
  toIssue,
  toIssues,
  visibleIssue,
} from "./issue-data.js";

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
  summary: "Change an issue's fields, or move it to another team",
  description:
    "Send the version you read and only the fields to change. If any of those fields changed after that version, the update is refused with 409 and the current issue: read it again and retry. Changes to other fields since then do not conflict.",
  request: { params: IssueParams, ...body(UpdateIssue) },
  responses: {
    200: json(Issue, "The issue"),
    409: json(IssueConflict, "Fields in the request changed after the version it sent"),
    ...errors("invalid_request", "unauthorized", "not_found"),
  },
});

const listSubIssues = createRoute({
  method: "get",
  path: "/organizations/{orgId}/issues/{issueRef}/sub-issues",
  tags: ["Issues"],
  summary: "An issue's sub-issues, oldest first",
  description: "Sub-issues in teams the caller cannot see are left out.",
  request: { params: IssueParams },
  responses: {
    200: json(z.array(LinkedIssue), "Sub-issues"),
    ...errors("unauthorized", "not_found"),
  },
});

export function issueRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(createIssue, async (c) => {
    const { orgId, teamId } = c.req.valid("param");
    const { labelIds: rawLabels, ...input } = c.req.valid("json");
    const labelIds = labelSet(rawLabels);
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
      if (input.assigneeId) await checkAssignee(tx, team, input.assigneeId);
      if (input.delegateId) await checkDelegate(tx, team, input.delegateId);
      if (input.parentId) await checkParent(tx, caller, input.parentId);
      await checkLabels(tx, team, labelIds);

      const { number, key } = await nextNumber(tx, teamId);
      const [row] = await tx
        .insert(issues)
        .values({ ...input, orgId, teamId, statusId, number, creatorId: caller.id })
        .returning();
      await tx.insert(issueNumbers).values({ orgId, teamId, number, issueId: row!.id });
      if (labelIds.length) {
        await tx.insert(issueLabels).values(labelIds.map((labelId) => ({ orgId, issueId: row!.id, labelId })));
      }

      const created = toIssue(row!, key, labelIds, null);
      const {
        id: _id,
        version: _version,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        number: _number,
        latestProgress: _latestProgress,
        ...data
      } = created;
      await emit(tx, orgId, { type: "issue.created", actorId: caller.id, subjectId: row!.id, data });
      return created;
    });
    return c.json(issue, 201);
  });

  app.openapi(listIssues, async (c) => {
    const { orgId, teamId } = c.req.valid("param");
    const list = await inOrg(deps, c, orgId, async (tx, caller) => {
      const team = await visibleTeam(tx, caller, teamId);
      const rows = await tx
        .select()
        .from(issues)
        .where(and(eq(issues.teamId, teamId), isNull(issues.deletedAt)))
        .orderBy(desc(issues.number));
      return toIssues(tx, rows, () => team.key);
    });
    return c.json(list, 200);
  });

  app.openapi(getIssue, async (c) => {
    const { orgId, issueRef } = c.req.valid("param");
    const issue = await inOrg(deps, c, orgId, async (tx, caller) => {
      const { issue, team } = await visibleIssue(tx, caller, issueRef);
      return loadIssue(tx, issue, team);
    });
    return c.json(issue, 200);
  });

  app.openapi(listSubIssues, async (c) => {
    const { orgId, issueRef } = c.req.valid("param");
    const list = await inOrg(deps, c, orgId, async (tx, caller) => {
      const { issue } = await visibleIssue(tx, caller, issueRef);
      return linkedIssues(tx, caller, eq(issues.parentId, issue.id));
    });
    return c.json(list, 200);
  });

  app.openapi(updateIssue, async (c) => {
    const { orgId, issueRef } = c.req.valid("param");
    const { version, ...input } = c.req.valid("json");
    const fields = { ...input, labelIds: input.labelIds && labelSet(input.labelIds) };
    const issue = await inOrg(deps, c, orgId, async (tx, caller) => {
      const { issue: row, team } = await visibleIssue(tx, caller, issueRef, { forUpdate: true });
      const current = await loadIssue(tx, row, team);
      const changes: Record<string, { from: unknown; to: unknown }> = changesOf(current, fields);
      const changed = Object.keys(changes) as (keyof typeof fields)[];

      // ADR 0018: stale only if a field this request changes was changed
      // after the version it read.
      const stale = changed.filter((field) => (row.fieldVersions[field] ?? 1) > version);
      if (version > row.version || stale.length > 0) {
        throw conflict(
          version > row.version
            ? `The issue is at version ${row.version}, not ${version}.`
            : `${stale.join(", ")} changed after version ${version}. Read the issue again and retry.`,
          { fields: stale, current },
        );
      }
      if (changed.length === 0) {
        return current;
      }

      // The values after this change, and the team they must fit.
      const next = { ...current, ...Object.fromEntries(changed.map((field) => [field, fields[field]])) };
      let target = team;
      if (changes.teamId) {
        target = await visibleTeam(tx, caller, fields.teamId!).catch(() => {
          throw invalid("teamId is not a team you can see.");
        });
        if (!changes.statusId) next.statusId = await mapStatus(tx, current.statusId, target);
        if (!changes.labelIds) next.labelIds = await keepOrgLabels(current.labelIds);
      }
      if (next.statusId !== current.statusId) await checkStatus(tx, target, next.statusId);
      if (next.assigneeId && (changes.teamId || changes.assigneeId)) await checkAssignee(tx, target, next.assigneeId);
      if (next.delegateId && (changes.teamId || changes.delegateId)) await checkDelegate(tx, target, next.delegateId);
      if (changes.labelIds || changes.teamId) await checkLabels(tx, target, next.labelIds);
      if (changes.parentId && next.parentId) await checkParent(tx, caller, next.parentId, row.id);

      // Changes the move made without being asked, recorded like the rest.
      for (const field of ["statusId", "labelIds"] as const) {
        if (!changes[field] && JSON.stringify(next[field]) !== JSON.stringify(current[field])) {
          changes[field] = { from: current[field], to: next[field] };
        }
      }

      let number = row.number;
      if (changes.teamId) {
        ({ number } = await nextNumber(tx, target.id));
        await tx.insert(issueNumbers).values({ orgId, teamId: target.id, number, issueId: row.id });
        changes.identifier = { from: current.identifier, to: `${target.key}-${number}` };
      }

      const nextVersion = row.version + 1;
      const fieldVersions = { ...row.fieldVersions };
      for (const field of Object.keys(changes)) {
        if (field !== "identifier") fieldVersions[field] = nextVersion;
      }
      const [updated] = await tx
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
          version: nextVersion,
          fieldVersions,
          updatedAt: new Date(),
        })
        .where(eq(issues.id, row.id))
        .returning();
      if (changes.labelIds) {
        await tx.delete(issueLabels).where(eq(issueLabels.issueId, row.id));
        if (next.labelIds.length) {
          await tx.insert(issueLabels).values(next.labelIds.map((labelId) => ({ orgId, issueId: row.id, labelId })));
        }
      }
      await emit(tx, orgId, {
        type: "issue.updated",
        actorId: caller.id,
        subjectId: row.id,
        data: { version: nextVersion, changes },
      });
      return toIssue(updated!, target.key, next.labelIds, current.latestProgress);

      // A moving issue keeps its organization labels and drops its old team's.
      async function keepOrgLabels(labelIds: string[]): Promise<string[]> {
        if (labelIds.length === 0) return [];
        const kept = await tx.query.labels.findMany({
          columns: { id: true },
          where: (labels, { and, inArray, isNull }) => and(inArray(labels.id, labelIds), isNull(labels.teamId)),
        });
        return labelSet(kept.map((label) => label.id));
      }
    });
    return c.json(issue, 200);
  });

  return app;
}
