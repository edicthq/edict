import type { Issue, Member, Priority, Status, StatusCategory, Team } from "@edicthq/client";

export const priorityLabel: Record<Priority, string> = {
  none: "No priority",
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

// Menu order, most pressing first.
export const priorities: Priority[] = ["none", "urgent", "high", "medium", "low"];

const priorityRank: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

// Most pressing first, then newest.
export function byPriority(a: Issue, b: Issue): number {
  return priorityRank[a.priority] - priorityRank[b.priority] || b.number - a.number;
}

export const categoryLabel: Record<StatusCategory, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
  canceled: "Canceled",
};

// How far along the in-progress stages a status is, for its icon's fill: the
// first stage fills half, later ones fill more, as In Review does in the
// prototype.
export function statusFill(statuses: Status[], status: Status): number {
  const stages = statuses.filter((s) => s.category === "in_progress");
  const index = stages.findIndex((s) => s.id === status.id);
  return index < 0 ? 0.5 : 0.5 + (0.5 * index) / stages.length;
}

export interface StatusGroup {
  status: Status;
  issues: Issue[];
}

// The list puts the work closest to done on top, as the prototype does: the
// in-progress stages from the last one back, then Todo and Backlog, then Done
// and Canceled. Empty groups are left out.
const listCategories: StatusCategory[] = ["in_progress", "todo", "backlog", "done", "canceled"];

export function listGroups(statuses: Status[], issues: Issue[]): StatusGroup[] {
  return listCategories
    .flatMap((category) => statuses.filter((s) => s.category === category).reverse())
    .map((status) => ({ status, issues: issues.filter((i) => i.statusId === status.id).sort(byPriority) }))
    .filter((group) => group.issues.length > 0);
}

// The board shows every status as a column, in workflow order.
export function boardColumns(statuses: Status[], issues: Issue[]): StatusGroup[] {
  return statuses.map((status) => ({
    status,
    issues: issues.filter((i) => i.statusId === status.id).sort(byPriority),
  }));
}

// Who can answer for issues in a team: humans who can see it. Guests see only
// their own teams; Members see public teams; Admins and Owners see all.
export function assignable(team: Team, orgMembers: Member[], teamMembers: Member[]): Member[] {
  const inTeam = new Set(teamMembers.map((m) => m.id));
  return orgMembers.filter(
    (m) =>
      m.kind === "human" &&
      (inTeam.has(m.id) || m.role === "owner" || m.role === "admin" || (!team.private && m.role === "member")),
  );
}

// "now", "5m", "3h", "2d", "6w": the prototype's age column.
export function ago(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

export const estimates = [1, 2, 3, 5, 8];
