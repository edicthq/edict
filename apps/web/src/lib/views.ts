import type { Issue, Member, Priority, Status, StatusCategory } from "@edicthq/client";

// A team page's filter, grouping and sort. All of it runs over the client
// collection: parse from and serialize to the URL's own params, missing
// meaning the default, so links to a share a person's exact view.

export type GroupBy = "status" | "priority" | "assignee";
export const groupOptions: GroupBy[] = ["status", "priority", "assignee"];

export type SortBy = "priority" | "updated" | "created" | "title";
export const sortOptions: SortBy[] = ["priority", "updated", "created", "title"];
export type SortDir = "asc" | "desc";

export interface IssueView {
  q: string;
  statuses: string[];
  priorities: Priority[];
  assignees: string[];
  labels: string[];
  groupBy: GroupBy;
  sortBy: SortBy;
  dir: SortDir;
}

export const emptyView: IssueView = {
  q: "",
  statuses: [],
  priorities: [],
  assignees: [],
  labels: [],
  groupBy: "status",
  sortBy: "priority",
  dir: "asc",
};

// The direction each sort starts from, when the URL does not say.
export const defaultDirs: Record<SortBy, SortDir> = { priority: "asc", updated: "desc", created: "desc", title: "asc" };

const list = (value: string | null): string[] => (value ? value.split(",").filter(Boolean) : []);

export function parseView(params: URLSearchParams): IssueView {
  const groupBy = params.get("group");
  const sortBy = params.get("sort");
  const dir = params.get("dir");
  return {
    q: params.get("q") ?? "",
    statuses: list(params.get("status")),
    priorities: list(params.get("priority")) as Priority[],
    assignees: list(params.get("assignee")),
    labels: list(params.get("label")),
    groupBy: groupOptions.includes(groupBy as GroupBy) ? (groupBy as GroupBy) : emptyView.groupBy,
    sortBy: sortOptions.includes(sortBy as SortBy) ? (sortBy as SortBy) : emptyView.sortBy,
    dir: dir === "asc" || dir === "desc" ? dir : sortBy ? defaultDirs[sortBy as SortBy] : defaultDirs[emptyView.sortBy],
  };
}

// Only the keys that differ from the default go in the URL, so an untouched
// team page keeps a clean address.
export function serializeView(view: IssueView): Record<string, string> {
  const params: Record<string, string> = {};
  if (view.q) params.q = view.q;
  if (view.statuses.length) params.status = view.statuses.join(",");
  if (view.priorities.length) params.priority = view.priorities.join(",");
  if (view.assignees.length) params.assignee = view.assignees.join(",");
  if (view.labels.length) params.label = view.labels.join(",");
  if (view.groupBy !== emptyView.groupBy) params.group = view.groupBy;
  if (view.sortBy !== emptyView.sortBy) params.sort = view.sortBy;
  if (view.dir !== defaultDirs[view.sortBy]) params.dir = view.dir;
  return params;
}

export const hasFilters = (view: IssueView): boolean =>
  Boolean(view.q || view.statuses.length || view.priorities.length || view.assignees.length || view.labels.length);

// A shorthand a filter pill names, one value of one dimension. "none" only
// names the unassigned; other values are ids, priorities stay as values.
export type FilterKey = `status:${string}` | `priority:${string}` | `assignee:${string}` | `label:${string}`;

export const filterKeys = (view: IssueView): FilterKey[] => [
  ...view.statuses.map((s) => `status:${s}` as FilterKey),
  ...view.priorities.map((p) => `priority:${p}` as FilterKey),
  ...view.assignees.map((a) => `assignee:${a}` as FilterKey),
  ...view.labels.map((l) => `label:${l}` as FilterKey),
];

const parseKey = (key: FilterKey): { dimension: string; value: string } => {
  const at = key.indexOf(":");
  return { dimension: key.slice(0, at), value: key.slice(at + 1) };
};

// Toggle one filter pill in the view: any dimension's OR-set grows or loses
// one value. The sort direction stays.
export function toggleFilter(view: IssueView, key: FilterKey): IssueView {
  const at = key.indexOf(":");
  const dimension = key.slice(0, at) as "status" | "priority" | "assignee" | "label";
  const value = key.slice(at + 1);
  switch (dimension) {
    case "status":
      return {
        ...view,
        statuses: view.statuses.includes(value) ? view.statuses.filter((s) => s !== value) : [...view.statuses, value],
      };
    case "priority":
      return {
        ...view,
        priorities: view.priorities.includes(value as Priority)
          ? view.priorities.filter((p) => p !== value)
          : [...view.priorities, value as Priority],
      };
    case "assignee":
      return {
        ...view,
        assignees: view.assignees.includes(value) ? view.assignees.filter((a) => a !== value) : [...view.assignees, value],
      };
    case "label":
      return {
        ...view,
        labels: view.labels.includes(value) ? view.labels.filter((l) => l !== value) : [...view.labels, value],
      };
  }
}

export const groupLabel: Record<GroupBy, string> = { status: "Status", priority: "Priority", assignee: "Assignee" };
export const sortLabel: Record<SortBy, string> = {
  priority: "Priority",
  updated: "Last updated",
  created: "Created",
  title: "Title",
};

const priorityRank: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

export function sortIssues(issues: Issue[], sortBy: SortBy, dir: SortDir): Issue[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...issues].sort((a, b) => {
    switch (sortBy) {
      case "priority": {
        const rank = (priorityRank[a.priority] - priorityRank[b.priority]) * factor;
        return rank !== 0 ? rank : a.number - b.number;
      }
      case "updated":
        return (Date.parse(a.updatedAt) - Date.parse(b.updatedAt)) * factor;
      case "created":
        return (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * factor;
      case "title": {
        const title = a.title.localeCompare(b.title) * factor;
        return title !== 0 ? title : a.number - b.number;
      }
    }
  });
}

// The question splits on words, and every word has to hit the title or the
// identifier, in either case.
export function matches(issue: Issue, view: IssueView): boolean {
  if (view.q) {
    const haystack = `${issue.title} ${issue.identifier}`.toLowerCase();
    if (!view.q.toLowerCase().split(/\s+/).every((word) => haystack.includes(word))) return false;
  }
  if (view.statuses.length && !view.statuses.includes(issue.statusId)) return false;
  if (view.priorities.length && !view.priorities.includes(issue.priority)) return false;
  if (view.assignees.length && !view.assignees.includes(issue.assigneeId ?? "none")) return false;
  if (view.labels.length && !view.labels.some((label) => issue.labelIds.includes(label))) return false;
  return true;
}

export interface IssueGroup {
  status?: Status;
  priority?: Priority;
  assignee?: Member | null;
  issues: Issue[];
}

// The list's status ordering: work closest to done on top, then by group.
const listCategories: StatusCategory[] = ["in_progress", "todo", "backlog", "done", "canceled"];

export const priorityOrder: Priority[] = ["urgent", "high", "medium", "low", "none"];

// Splits filtered issues into groups, each with the issues the sort asks for.
// Statuses follow the team's workflow and the list's closeness-to-done order;
// priorities most pressing first; assignees the team's own roster, then the
// unassigned. Groups with nothing in them are left out.
export function groupIssues(issues: Issue[], view: IssueView, statuses: Status[], members: Member[]): IssueGroup[] {
  const sorted = sortIssues(issues, view.sortBy, view.dir);
  if (view.groupBy === "priority") {
    return priorityOrder
      .map((priority) => ({ priority, issues: sorted.filter((i) => i.priority === priority) }))
      .filter((group) => group.issues.length > 0);
  }
  if (view.groupBy === "assignee") {
    const unassigned = sorted.filter((i) => !i.assigneeId);
    const groups: IssueGroup[] = members.map((member) => ({
      assignee: member,
      issues: sorted.filter((i) => i.assigneeId === member.id),
    }));
    if (unassigned.length > 0) groups.push({ assignee: null, issues: unassigned });
    return groups.filter((group) => group.issues.length > 0);
  }
  return listCategories
    .flatMap((category) => statuses.filter((s) => s.category === category).reverse())
    .map((status) => ({ status, issues: sorted.filter((i) => i.statusId === status.id) }))
    .filter((group) => group.issues.length > 0);
}
