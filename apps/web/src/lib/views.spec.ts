import type { Issue, Member, Status } from "@edicthq/client";
import { describe, expect, it } from "vitest";
import {
  emptyView,
  filterKeys,
  groupIssues,
  hasFilters,
  inView,
  matches,
  parseView,
  sameView,
  serializeView,
  sortIssues,
  toggleFilter,
  type IssueView,
  type SortBy,
} from "./views.js";

let memberN = 0;
const member = (name: string): Member =>
  ({ id: `member-${++memberN}`, name } as Member);

const statusN = (suffix: string, category = suffix): Status => ({ id: suffix, category } as Status);

let issueN = 0;
const issue = (over: Partial<Issue> = {}): Issue =>
  ({
    id: `issue-${++issueN}`,
    number: issueN,
    title: `Issue ${issueN}`,
    priority: "none",
    statusId: statuses.backlog.id,
    assigneeId: null,
    labelIds: [],
    createdAt: "2026-10-10T10:00:00Z",
    updatedAt: "2026-10-10T10:00:00Z",
    ...over,
  } as Issue);

const statuses = {
  in_progress: statusN("in_progress"),
  todo: statusN("todo"),
  backlog: statusN("backlog"),
  done: statusN("done"),
};

describe("parseView", () => {
  it("reads an untouched URL as the default view", () => {
    expect(parseView(new URLSearchParams())).toEqual(emptyView);
  });

  it("leaves out the default sort direction", () => {
    const params = new URLSearchParams(serializeView(emptyView));
    expect(params.size).toBe(0);
  });

  it("round-trips a view through the URL without defaults", () => {
    const view: IssueView = {
      q: "tail",
      statuses: ["s1", "s2"],
      priorities: ["high", "low"],
      assignees: ["m1", "none"],
      labels: ["l1"],
      groupBy: "assignee",
      sortBy: "updated",
      dir: "asc",
    };
    expect(parseView(new URLSearchParams(serializeView(view)))).toEqual(view);
  });

  it("falls back to the sort's own default direction", () => {
    const view = parseView(new URLSearchParams("sort=updated"));
    expect(view.sortBy).toBe("updated");
    expect(view.dir).toBe("desc");
    const back = new URLSearchParams(serializeView({ ...view }));
    expect(back.get("dir")).toBeNull();
  });

  it("ignores unknown groups and sorts", () => {
    const view = parseView(new URLSearchParams("group=lane&sort=urgency"));
    expect(view.groupBy).toBe(emptyView.groupBy);
    expect(view.sortBy).toBe(emptyView.sortBy);
  });
});

describe("toggleFilter and hasFilters", () => {
  it("adds and removes one pill per dimension", () => {
    let view = toggleFilter(emptyView, "priority:high");
    expect(view.priorities).toEqual(["high"]);
    view = toggleFilter(view, "assignee:m1");
    view = toggleFilter(view, "priority:high");
    expect(view.priorities).toEqual([]);
    expect(view.assignees).toEqual(["m1"]);
    expect(filterKeys(view)).toEqual(["assignee:m1"]);
    expect(hasFilters(view)).toBe(true);
  });

  it("does not count group or sort as filters", () => {
    expect(hasFilters({ ...emptyView, groupBy: "priority", sortBy: "title" })).toBe(false);
  });
});

describe("matches", () => {
  it("each filter set is an OR within itself and an AND against the others", () => {
    const view = parseView(
      new URLSearchParams(serializeView({ ...emptyView, priorities: ["high", "urgent"], statuses: ["s1"] })),
    );
    const target = { statusId: "s1", priority: "high" } as Partial<Issue>;
    expect(matches(issue(target), view)).toBe(true);
    expect(matches(issue({ ...target, priority: "low" }), view)).toBe(false);
    expect(matches(issue({ ...target, statusId: "s2" } as Partial<Issue>), view)).toBe(false);
  });

  it("matches the question against titles and identifiers, case insensitively", () => {
    const view = { ...emptyView, q: "ENG-2 TAIL" };
    expect(matches(issue({ title: "Tailing the log", number: 2, identifier: "ENG-2" } as Partial<Issue>), view)).toBe(true);
    expect(matches(issue({ title: "Other work", number: 3, identifier: "ENG-3" } as Partial<Issue>), view)).toBe(false);
  });

  it("'none' names the unassigned", () => {
    const view = { ...emptyView, assignees: ["none"] };
    expect(matches(issue(), view)).toBe(true);
    expect(matches(issue({ assigneeId: "m1" } as Partial<Issue>), view)).toBe(false);
  });

  it("any shared label matches", () => {
    const view = { ...emptyView, labels: ["l1", "l2"] };
    expect(matches(issue({ labelIds: ["l9", "l2"] }), view)).toBe(true);
    expect(matches(issue({ labelIds: ["l8"] }), view)).toBe(false);
  });
});

describe("sortIssues", () => {
  const made = (over: Partial<Issue>): Issue => issue(over);

  it("sorts priorities most pressing first, asc breaking by number", () => {
    const low = made({ priority: "low", number: 1 });
    const urgent = made({ priority: "urgent", number: 2 });
    const none = made({ priority: "none", number: 3 });
    expect(sortIssues([none, low, urgent], "priority", "asc").map((i) => i.number)).toEqual([2, 1, 3]);
    expect(sortIssues([none, low, urgent], "priority", "desc").map((i) => i.number)).toEqual([3, 1, 2]);
  });

  it("sorts by time in both directions", () => {
    const early = made({ updatedAt: "2026-10-01T00:00:00Z", number: 1 });
    const late = made({ updatedAt: "2026-10-05T00:00:00Z", number: 2 });
    expect(sortIssues([late, early], "updated", "asc").map((i) => i.number)).toEqual([1, 2]);
    expect(sortIssues([early, late], "updated", "desc").map((i) => i.number)).toEqual([2, 1]);
  });

  it("sorts titles alphabetically and ties fall back to the issue number", () => {
    const beta = made({ title: "Beta", number: 2 });
    const alpha = made({ title: "Alpha", number: 1 });
    const beta2 = made({ title: "Beta", number: 4 });
    const out = sortIssues([beta2, alpha, beta], "title", "asc");
    expect(out.map((i) => i.number)).toEqual([1, 2, 4]);
  });
});

describe("groupIssues", () => {
  const team = [statuses.in_progress, statuses.todo, statuses.backlog, statuses.done];
  const amirali = member("Amirali");
  const sam = member("Sam");
  const people = [amirali, sam];

  it("groups by status in the list's closeness-to-done order and omits empty groups", () => {
    const a = issue({ statusId: statuses.todo.id });
    const b = issue({ statusId: statuses.in_progress.id });
    const out = groupIssues([a, b], emptyView, team, []);
    expect(out.map((g) => g.status?.id)).toEqual([statuses.in_progress.id, statuses.todo.id]);
    const [first, second] = out;
    expect(first?.issues.map((i) => i.id)).toEqual([b.id]);
    expect(second?.issues.map((i) => i.id)).toEqual([a.id]);
  });

  it("groups by priority in pressing order", () => {
    const out = groupIssues(
      [issue({ priority: "none" }), issue({ priority: "urgent" }), issue({ priority: "urgent" })],
      { ...emptyView, groupBy: "priority" },
      team,
      [],
    );
    const [first, second] = out;
    expect(out.map((g) => g.priority)).toEqual(["urgent", "none"]);
    expect(first?.issues).toHaveLength(2);
    expect(second?.priority).toBe("none");
  });

  it("groups by assignee in roster order with the unassigned last", () => {
    const out = groupIssues(
      [issue({ assigneeId: amirali.id }), issue({ priority: "low" })],
      { ...emptyView, groupBy: "assignee" },
      team,
      people,
    );
    expect(out.map((g) => (g.assignee ? g.assignee.name : "unassigned"))).toEqual(["Amirali", "unassigned"]);
    expect(out[1]?.assignee).toBeNull();
  });

  it("runs the view's sort inside every group", () => {
    const todo = [statuses.todo];
    const low = issue({ priority: "low", number: 1, updatedAt: "2026-10-01T00:00:00Z", statusId: statuses.todo.id });
    const high = issue({
      priority: "high",
      number: 2,
      updatedAt: "2026-10-02T00:00:00Z",
      statusId: statuses.todo.id,
    });
    const newestFirst = { sortBy: "updated" as SortBy, dir: "desc" as const };
    const byNewest = groupIssues([low, high], { ...emptyView, ...newestFirst }, todo, []);
    expect(byNewest[0]?.issues.map((i) => i.number)).toEqual([2, 1]);
  });
});

describe("inView", () => {
  it("fills what a saved query leaves out", () => {
    expect(inView({ q: "kelp" })).toEqual({ ...emptyView, q: "kelp" });
    expect(inView({ sortBy: "updated" })).toEqual({ ...emptyView, sortBy: "updated", dir: "desc" });
    expect(inView({ groupBy: "weird" as string })).toEqual(emptyView);
  });
});

describe("sameView", () => {
  it("compares member lists as sets, and the rest exactly", () => {
    expect(sameView(emptyView, emptyView)).toBe(true);
    expect(sameView({ ...emptyView, statuses: ["Todo", "Done"] }, { ...emptyView, statuses: ["Done", "Todo"] })).toBe(true);
    expect(sameView({ ...emptyView, q: "a" }, { ...emptyView, q: "b" })).toBe(false);
    expect(sameView({ ...emptyView, dir: "desc" }, { ...emptyView, dir: "asc" })).toBe(false);
  });
});
