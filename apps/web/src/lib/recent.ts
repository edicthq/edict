import type { Issue, Priority } from "@edicthq/client";

// The issues a person opened last, newest first, kept in this browser per
// organization so ⌘K can offer them before anything is typed. A snapshot is
// enough here: opening the issue again refreshes it.

export interface RecentIssue {
  id: string;
  identifier: string;
  title: string;
  teamId: string;
  priority: Priority;
}

const LIMIT = 5;
const key = (orgId: string) => `edict.recent.${orgId}`;

export function recentIssues(orgId: string): RecentIssue[] {
  try {
    const list = JSON.parse(localStorage.getItem(key(orgId)) ?? "[]") as unknown;
    return Array.isArray(list) ? (list as RecentIssue[]).slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}

export function rememberIssue(orgId: string, issue: Issue): void {
  const entry: RecentIssue = {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    teamId: issue.teamId,
    priority: issue.priority,
  };
  const rest = recentIssues(orgId).filter((recent) => recent.id !== issue.id);
  try {
    localStorage.setItem(key(orgId), JSON.stringify([entry, ...rest].slice(0, LIMIT)));
  } catch {
    // Storage full or blocked: the palette just has no recent issues.
  }
}
