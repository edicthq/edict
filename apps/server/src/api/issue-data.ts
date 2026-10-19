import { and, asc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  issueLabels,
  issueNumbers,
  issues,
  labels,
  progressUpdates,
  projects,
  statuses,
  teamKeys,
  teams,
  type Transaction,
} from "@edicthq/db";
import type { Issue, LinkedIssue, ProgressUpdate } from "@edicthq/schema";
import type { Caller } from "./callers.js";
import { activeMember, canSeeTeam, teamVisibility, type TeamRow } from "./access.js";
import { gone, invalid, notFound } from "./errors.js";
import { projectVisibility } from "./projects.js";

export type IssueRow = typeof issues.$inferSelect;
type StatusRow = typeof statuses.$inferSelect;

export function toIssue(row: IssueRow, teamKey: string, labelIds: string[], latestProgress: ProgressUpdate | null): Issue {
  return {
    id: row.id,
    identifier: `${teamKey}-${row.number}`,
    number: row.number,
    teamId: row.teamId,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    statusId: row.statusId,
    priority: row.priority,
    estimate: row.estimate,
    assigneeId: row.assigneeId,
    delegateId: row.delegateId,
    latestProgress,
    labelIds,
    parentId: row.parentId,
    creatorId: row.creatorId,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Label ids per issue, each list sorted, so equal sets compare equal.
export async function labelsOf(tx: Transaction, issueIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>(issueIds.map((id) => [id, []]));
  if (issueIds.length === 0) return map;
  const rows = await tx
    .select()
    .from(issueLabels)
    .where(inArray(issueLabels.issueId, issueIds))
    .orderBy(asc(issueLabels.labelId));
  for (const row of rows) map.get(row.issueId)?.push(row.labelId);
  return map;
}

export async function toIssues(tx: Transaction, rows: IssueRow[], teamKey: (row: IssueRow) => string): Promise<Issue[]> {
  const ids = rows.map((row) => row.id);
  const labelMap = await labelsOf(tx, ids);
  const progressMap = await latestProgressOf(tx, ids);
  return rows.map((row) => toIssue(row, teamKey(row), labelMap.get(row.id) ?? [], progressMap.get(row.id) ?? null));
}

export type ProgressRow = typeof progressUpdates.$inferSelect;

export function toProgress(row: ProgressRow): ProgressUpdate {
  return {
    id: row.id,
    issueId: row.issueId,
    agentId: row.agentId,
    state: row.state,
    message: row.message,
    links: row.links,
    createdAt: row.createdAt.toISOString(),
  };
}

// The newest progress update of each issue that has one.
export async function latestProgressOf(tx: Transaction, issueIds: string[]): Promise<Map<string, ProgressUpdate>> {
  if (issueIds.length === 0) return new Map();
  const rows = await tx
    .selectDistinctOn([progressUpdates.issueId])
    .from(progressUpdates)
    .where(inArray(progressUpdates.issueId, issueIds))
    .orderBy(progressUpdates.issueId, sql`${progressUpdates.id} DESC`);
  return new Map(rows.map((row) => [row.issueId, toProgress(row)]));
}

// A set of label ids as stored and compared: no duplicates, sorted.
export function labelSet(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identifierPattern = /^([A-Z][A-Z0-9]{1,6})-([1-9][0-9]{0,8})$/;

// The id of the issue a reference names: its UUID, or any identifier it has
// had, through the key and number history (ADR 0017).
export async function issueIdOf(tx: Transaction, orgId: string, ref: string): Promise<string | undefined> {
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

// The issue a reference names, with its team, if the caller can see its team.
// Locks the issue row when updating. A trashed issue answers 410, saying how
// to get it back (ADR 0019), unless the caller asks for trashed ones too.
export async function visibleIssue(
  tx: Transaction,
  caller: Caller,
  ref: string,
  options: { forUpdate?: boolean; trashed?: boolean } = {},
): Promise<{ issue: IssueRow; team: TeamRow }> {
  const issueId = await issueIdOf(tx, caller.orgId, ref);
  if (issueId) {
    const query = tx
      .select({ issue: issues, team: teams })
      .from(issues)
      .innerJoin(teams, eq(teams.id, issues.teamId))
      .where(and(eq(issues.orgId, caller.orgId), eq(issues.id, issueId), teamVisibility(tx, caller)));
    const [row] = await (options.forUpdate ? query.for("update", { of: issues }) : query);
    if (row?.issue.deletedAt && !options.trashed) {
      const identifier = `${row.team.key}-${row.issue.number}`;
      throw gone(
        `${identifier} is in the trash. POST /api/v1/organizations/${caller.orgId}/issues/${identifier}/restore brings it back within 30 days of deletion.`,
      );
    }
    if (row) {
      return row;
    }
  }
  throw notFound("issue");
}

export async function loadIssue(tx: Transaction, issue: IssueRow, team: TeamRow): Promise<Issue> {
  const [issueWithExtras] = await toIssues(tx, [issue], () => team.key);
  return issueWithExtras!;
}

// Issues as other issues show them, in teams the caller can see.
export async function linkedIssues(tx: Transaction, caller: Caller, where: SQL): Promise<LinkedIssue[]> {
  const rows = await tx
    .select({ issue: issues, key: teams.key, status: statuses })
    .from(issues)
    .innerJoin(teams, eq(teams.id, issues.teamId))
    .innerJoin(statuses, eq(statuses.id, issues.statusId))
    .where(and(where, isNull(issues.deletedAt), teamVisibility(tx, caller)))
    .orderBy(asc(issues.createdAt), asc(issues.id));
  return rows.map(({ issue, key, status }) => toLinked(issue, key, status));
}

export function toLinked(issue: IssueRow, teamKey: string, status: StatusRow): LinkedIssue {
  return {
    id: issue.id,
    identifier: `${teamKey}-${issue.number}`,
    title: issue.title,
    teamId: issue.teamId,
    status: { id: status.id, name: status.name, category: status.category },
    priority: issue.priority,
    assigneeId: issue.assigneeId,
  };
}

// ---------- checks on the values of an issue's fields ----------

export async function checkStatus(tx: Transaction, team: TeamRow, statusId: string): Promise<void> {
  const [status] = await tx
    .select({ id: statuses.id })
    .from(statuses)
    .where(and(eq(statuses.teamId, team.id), eq(statuses.id, statusId)));
  if (!status) {
    throw invalid(`statusId is not a status of team ${team.key}. GET the team's statuses for the valid ones.`);
  }
}

// The assignee answers for the issue, so it is a human who can see its team.
export async function checkAssignee(tx: Transaction, team: TeamRow, assigneeId: string): Promise<void> {
  const assignee = await activeMember(tx, team.orgId, assigneeId).catch(() => undefined);
  if (!assignee || assignee.kind !== "human" || !(await canSeeTeam(tx, assignee, team))) {
    throw invalid(`The assignee must be a human member who can see team ${team.key}.`);
  }
}

// The delegate does the work, so it is an active agent who can see the team:
// through its own team access, or its human's for a connected agent.
export async function checkDelegate(tx: Transaction, team: TeamRow, delegateId: string): Promise<void> {
  const agent = await activeMember(tx, team.orgId, delegateId).catch(() => undefined);
  let sees = false;
  if (agent?.kind === "agent" && !agent.pausedAt) {
    const access = agent.connectedBy ? await activeMember(tx, team.orgId, agent.connectedBy).catch(() => undefined) : agent;
    sees = access !== undefined && (await canSeeTeam(tx, access, team));
  }
  if (!sees) {
    throw invalid(`The delegate must be an agent that is not paused and can see team ${team.key}. GET the organization's agents for the options.`);
  }
}

// Organization labels, or labels of the issue's own team.
export async function checkLabels(tx: Transaction, team: TeamRow, labelIds: string[]): Promise<void> {
  if (labelIds.length === 0) return;
  const found = await tx
    .select({ id: labels.id })
    .from(labels)
    .where(and(inArray(labels.id, labelIds), or(isNull(labels.teamId), eq(labels.teamId, team.id))));
  if (found.length !== labelIds.length) {
    throw invalid(
      `labelIds must be organization labels or labels of team ${team.key}. GET the team's labels for the valid ones.`,
    );
  }
}

// A project in the organization that is not in the trash.
// A project the caller can see and that is not in the trash.
export async function checkProject(tx: Transaction, caller: Caller, projectId: string): Promise<void> {
  const [project] = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.orgId, caller.orgId), eq(projects.id, projectId), isNull(projects.deletedAt), projectVisibility(tx, caller)));
  if (!project) {
    throw invalid("projectId is not a project you can see.");
  }
}

// A parent the caller can see, which is not the issue itself or one of its
// sub-issues, however deep.
export async function checkParent(tx: Transaction, caller: Caller, parentId: string, issueId?: string): Promise<void> {
  const parent = await visibleIssue(tx, caller, parentId).catch(() => undefined);
  if (!parent) {
    throw invalid("parentId is not an issue you can see.");
  }
  if (!issueId) return;
  const { rows } = await tx.execute<{ id: string }>(sql`
    WITH RECURSIVE ancestors(id, parent_id) AS (
      SELECT id, parent_id FROM issues WHERE id = ${parentId}
      UNION
      SELECT i.id, i.parent_id FROM issues i JOIN ancestors a ON i.id = a.parent_id
    )
    SELECT id FROM ancestors WHERE id = ${issueId}`);
  if (rows.length > 0) {
    throw invalid("That parent is this issue or one of its sub-issues, which would make a cycle.");
  }
}

// Where an issue's status lands when it moves to another team: the status
// with the same name, else the first one in the same category, else the
// team's default.
export async function mapStatus(tx: Transaction, statusId: string, target: TeamRow): Promise<string> {
  const [from] = await tx.select().from(statuses).where(eq(statuses.id, statusId));
  const options = await tx
    .select()
    .from(statuses)
    .where(eq(statuses.teamId, target.id))
    .orderBy(asc(statuses.position), asc(statuses.createdAt));
  const match =
    options.find((s) => s.name.toLowerCase() === from?.name.toLowerCase()) ??
    options.find((s) => s.category === from?.category) ??
    options.find((s) => s.isDefault);
  return match!.id;
}

// Takes the team's next issue number. Locks its counter until commit, so
// concurrent creations in one team take turns and never share a number.
export async function nextNumber(tx: Transaction, teamId: string): Promise<{ number: number; key: string }> {
  const [counter] = await tx
    .update(teams)
    .set({ issueCounter: sql`${teams.issueCounter} + 1` })
    .where(eq(teams.id, teamId))
    .returning({ number: teams.issueCounter, key: teams.key });
  return counter!;
}
