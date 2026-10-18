import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import type { Agent, Issue, Label, Member, Priority, Status, Team } from "@edicthq/client";
import { Avatar, Button, Kbd, LabelPill, Menu, PriorityIcon, ProgressBadge, StatusIcon, TeamKey, cn } from "@edicthq/ui";
import type { MenuItem } from "@edicthq/ui";
import { ArrowDown, ArrowUp, ListFilter, Search, X } from "lucide-react";
import { CreateIssueDialog } from "../components/create-issue-dialog.js";
import { NoAssignee } from "../components/issue-fields.js";
import { IssuePeek, type PeekMenu } from "../components/issue-peek.js";
import { EmptyState, Loading, PageBody, PageHeader } from "../components/shell.js";
import { useToast } from "../components/toast.js";
import { useOfferUndo } from "../components/undo.js";
import { agentState, plainLine, waitingLine } from "../lib/agents.js";
import { ago, assignable, boardColumns, categoryLabel, priorityLabel, statusFill, type StatusGroup } from "../lib/issues.js";
import {
  useAgents,
  useIssue,
  useMembers,
  useStatuses,
  useTeamLabels,
  useTeamMembers,
  useTeams,
  useUpdateIssue,
} from "../lib/queries.js";
import { useTeamIssues } from "../lib/collections.js";
import {
  defaultDirs,
  filterKeys,
  groupIssues,
  groupLabel,
  groupOptions,
  hasFilters,
  matches,
  parseView,
  priorityOrder,
  serializeView,
  sortLabel,
  sortOptions,
  toggleFilter,
  type FilterKey,
  type IssueGroup,
  type IssueView,
} from "../lib/views.js";
import { useOrg } from "./org.js";

type View = "list" | "board";

// Keys that act on the page only when no field, menu or dialog has focus.
function typing(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement;
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    document.querySelector("dialog[open]") !== null
  );
}

export function TeamIssuesPage() {
  const { teamId = "" } = useParams();
  const { orgId } = useOrg();
  const teams = useTeams(orgId);
  const team = teams.data?.find((t) => t.id === teamId);

  if (teams.isPending) return <Loading />;
  if (!team) {
    return (
      <PageBody className="pt-6">
        <EmptyState title="Team not found" body="It doesn't exist, or it's a private team you aren't in." />
      </PageBody>
    );
  }
  return <TeamIssues key={team.id} team={team} />;
}

function TeamIssues({ team }: { team: Team }) {
  const { orgId, slug, membership } = useOrg();
  const statuses = useStatuses(orgId, team.id);
  const issues = useTeamIssues(orgId, team.id);
  const orgMembers = useMembers(orgId);
  const teamMembers = useTeamMembers(orgId, team.id);
  const labels = useTeamLabels(orgId, team.id);
  const teams = useTeams(orgId);
  const agents = useAgents(orgId);
  const update = useUpdateIssue(orgId);
  const toast = useToast();
  const offerUndo = useOfferUndo();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "board" ? "board" : "list";
  const peekRef = params.get("issue");
  const issueView = useMemo(() => parseView(params), [params]);
  // The create dialog, and the issue it makes a sub-issue of.
  const [creating, setCreating] = useState<{ parent?: Issue } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [menu, setMenu] = useState<PeekMenu>(null);

  const filtered = useMemo(
    () => (issues.data ?? []).filter((issue) => matches(issue, issueView)),
    [issues.data, issueView],
  );
  const members = useMemo(
    () => assignable(team, orgMembers.data ?? [], teamMembers.data ?? []),
    [team, orgMembers.data, teamMembers.data],
  );
  const groups = useMemo<IssueGroup[]>(() => {
    if (!statuses.data) return [];
    return groupIssues(filtered, issueView, statuses.data, members);
  }, [statuses.data, filtered, issueView, members]);
  // The board keeps its status columns whatever the list groups by.
  const boardGroups = useMemo<StatusGroup[]>(() => {
    if (!statuses.data) return [];
    return boardColumns(statuses.data, filtered);
  }, [statuses.data, filtered]);
  // Keyboard order: down the list, or down each board column in turn.
  const order = useMemo(() => (view === "board" ? boardGroups : groups).flatMap((g) => g.issues), [groups, boardGroups, view]);

  const byRef = (ref: string) => {
    const upper = ref.toUpperCase();
    return issues.data?.find((i) => i.identifier === upper || i.id === ref);
  };
  const peeked = peekRef ? byRef(peekRef) : undefined;
  // Not in this team's list under that name: an old identifier, or an issue
  // in another team. The API knows every identifier an issue has had.
  const lookup = useIssue(orgId, peekRef && issues.data && !peeked ? peekRef : null);

  const setParam = (name: string, value: string | null, replace = false) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === null) next.delete(name);
        else next.set(name, value);
        return next;
      },
      { replace },
    );

  const viewKeys = ["q", "status", "priority", "assignee", "label", "group", "sort", "dir"] as const;

  // Writes a change to the view, dropping every key it stops carrying. Other
  // params — the open issue, the layout — survive untouched. A new sort gets
  // its own default direction, not the previous sort's.
  const patchView = (partial: Partial<IssueView>, replace = false) => {
    setParams(
      (current) => {
        const next = { ...parseView(current), ...partial };
        if (partial.sortBy !== undefined && partial.dir === undefined) next.dir = defaultDirs[partial.sortBy];
        const search = new URLSearchParams(current);
        for (const key of viewKeys) search.delete(key);
        for (const [key, value] of Object.entries(serializeView(next))) {
          search.set(key, value);
        }
        return search;
      },
      { replace },
    );
  };
  const toggleFilterKey = (key: FilterKey) => patchView(toggleFilter(issueView, key));
  const clearFilters = () => patchView({ q: "", statuses: [], priorities: [], assignees: [], labels: [] });
  // `/` puts the caret in the search field. The search input's ref is needed
  // for that and nothing else.
  const searchRef = useRef<HTMLInputElement>(null);
  const openIssue = (issue: Issue | undefined) => {
    if (!issue) return;
    setFocusId(issue.id);
    setParam("issue", issue.identifier, peekRef !== null);
  };
  // An issue from a link in the peek: in the peek if it's this team's, else
  // over its own team's list.
  const openLinked = (identifier: string) => {
    const here = byRef(identifier);
    if (here) openIssue(here);
    else navigate(`/${slug}/issue/${identifier}`);
  };
  const closePeek = () => {
    setMenu(null);
    setParam("issue", null);
  };

  useEffect(() => {
    if (!peekRef || !lookup.data && !lookup.error) return;
    if (lookup.data) {
      const found = lookup.data;
      if (found.teamId === team.id) setParam("issue", found.identifier, true);
      else navigate(`/${slug}/teams/${found.teamId}?issue=${found.identifier}`, { replace: true });
    } else {
      toast(`There's no issue ${peekRef.toUpperCase()} you can see.`);
      setParam("issue", null, true);
    }
    // Runs when the lookup settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup.data, lookup.error]);

  // The listener stays registered once and always runs this render's handler,
  // so it never acts on stale issues or search params.
  const onKey = useRef<(event: KeyboardEvent) => void>(() => {});
  onKey.current = (event) => {
    if (typing(event)) return;
    const index = order.findIndex((i) => i.id === (peeked?.id ?? focusId));
    const move = (by: number) => {
      event.preventDefault();
      const next = order[Math.min(order.length - 1, Math.max(0, index < 0 ? 0 : index + by))];
      if (!next) return;
      setFocusId(next.id);
      if (peeked) openIssue(next);
      else document.getElementById(`issue-${next.id}`)?.focus();
    };
    const key = event.key.toLowerCase();
    if (key === "j" || event.key === "ArrowDown") move(1);
    else if (key === "k" || event.key === "ArrowUp") move(-1);
    else if (event.key === "Escape" && peeked) {
      event.preventDefault();
      closePeek();
      requestAnimationFrame(() => document.getElementById(`issue-${peeked.id}`)?.focus());
    } else if (key === "c") {
      event.preventDefault();
      setCreating({});
    } else if (key === "/") {
      event.preventDefault();
      searchRef.current?.focus();
    } else if (key === "v") {
      event.preventDefault();
      setParam("view", view === "list" ? "board" : null);
    } else if (peeked && (key === "s" || key === "p" || key === "a" || key === "d")) {
      event.preventDefault();
      setMenu(key === "s" ? "status" : key === "p" ? "priority" : key === "a" ? "assignee" : "delegate");
    }
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const loading = statuses.isPending || issues.isLoading;
  const statusList = statuses.data ?? [];
  const labelList = labels.data ?? [];

  // One flat menu of everything a team page can filter by, each entry
  // renamed by its dimension in the keywords, so typing finds it.
  const filterItems = useMemo<MenuItem<FilterKey>[]>(() => {
    if (!statuses.data) return [];
    return [
      ...statuses.data.map((status) => ({
        value: `status:${status.id}` as FilterKey,
        label: status.name,
        keywords: `status ${categoryLabel[status.category]}`,
        icon: <StatusIcon category={status.category} fill={statusFill(statuses.data as Status[], status)} />,
      })),
      ...priorityOrder.map((priority) => ({
        value: `priority:${priority}` as FilterKey,
        label: priorityLabel[priority],
        keywords: "priority",
      })),
      ...members.map((member) => ({
        value: `assignee:${member.id}` as FilterKey,
        label: member.name,
        keywords: "assignee person",
        icon: <Avatar name={member.name} size={18} />,
      })),
      { value: "assignee:none", label: "Unassigned", keywords: "assignee person" },
      ...labelList.map((label) => ({
        value: `label:${label.id}` as FilterKey,
        label: label.name,
        keywords: "label",
        icon: <LabelPill name={label.name} hue={label.hue} />,
      })),
    ];
  }, [statuses.data, members, labelList]);

  const filterName = (key: FilterKey): string => {
    const at = key.indexOf(":");
    const value = key.slice(at + 1);
    switch (key.slice(0, at)) {
      case "status":
        return statusList.find((s) => s.id === value)?.name ?? value;
      case "priority":
        return priorityLabel[value as Priority];
      case "assignee":
        return value === "none" ? "Unassigned" : (members.find((m) => m.id === value)?.name ?? value);
      default:
        return labelList.find((l) => l.id === value)?.name ?? value;
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <PageHeader
        lead={<TeamKey>{team.key}</TeamKey>}
        title={team.name}
        actions={
          <>
            <Button variant="ghost" className="h-8 text-ui" onClick={() => navigate(`/${slug}/teams/${team.id}/members`)}>
              Members
            </Button>
            <Button variant="primary" onClick={() => setCreating({})}>
              New issue <Kbd>C</Kbd>
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3 px-6 pb-2">
        <div role="group" aria-label="View" className="inline-flex gap-0.5 rounded-md bg-hover p-[3px]">
          {(["list", "board"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setParam("view", v === "board" ? "board" : null)}
              className="rounded-[7px] px-3 py-1 text-ui font-medium text-ink-2 hover:text-ink aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-[0_0_0_1px_var(--line)]"
            >
              {v === "list" ? "List" : "Board"}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
          <input
            ref={searchRef}
            value={issueView.q}
            onChange={(event) => patchView({ q: event.target.value }, true)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.stopPropagation();
              if (issueView.q) patchView({ q: "" }, true);
              else event.currentTarget.blur();
            }}
            placeholder="Search"
            aria-label="Search issues"
            className="h-7 w-44 rounded-md bg-surface ps-7 pe-2 text-ui text-ink placeholder:text-ink-3 shadow-[inset_0_0_0_1px_var(--line)] focus-visible:shadow-[inset_0_0_0_1.5px_var(--line-strong)] focus-visible:outline-none"
          />
        </div>

        <Menu
          label="Filter"
          items={filterItems}
          values={filterKeys(issueView)}
          multiple
          onSelect={toggleFilterKey}
          trigger={(props) => (
            <button
              ref={props.ref}
              type="button"
              onClick={props.onClick}
              aria-haspopup={props["aria-haspopup"]}
              aria-expanded={props["aria-expanded"]}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-ui font-medium text-ink-2 hover:bg-hover hover:text-ink"
            >
              <ListFilter aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              Filter
              {filterKeys(issueView).length > 0 ? (
                <span className="rounded-full bg-hover px-1.5 text-sm tabular-nums">{filterKeys(issueView).length}</span>
              ) : null}
            </button>
          )}
        />

        <Menu
          label="Grouping"
          items={groupOptions.map((g) => ({ value: g, label: groupLabel[g] }))}
          value={issueView.groupBy}
          onSelect={(g) => patchView({ groupBy: g })}
          trigger={(props) => (
            <button
              ref={props.ref}
              type="button"
              onClick={props.onClick}
              aria-haspopup={props["aria-haspopup"]}
              aria-expanded={props["aria-expanded"]}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-ui font-medium text-ink-2 hover:bg-hover hover:text-ink"
            >
              Group <span className="text-ink">{groupLabel[issueView.groupBy]}</span>
            </button>
          )}
        />

        {view === "list" ? (
          <>
            <Menu
              label="Sorting"
              items={sortOptions.map((s) => ({ value: s, label: sortLabel[s] }))}
              value={issueView.sortBy}
              onSelect={(s) => patchView({ sortBy: s })}
              trigger={(props) => (
                <button
                  ref={props.ref}
                  type="button"
                  onClick={props.onClick}
                  aria-haspopup={props["aria-haspopup"]}
                  aria-expanded={props["aria-expanded"]}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-ui font-medium text-ink-2 hover:bg-hover hover:text-ink"
                >
                  Sort <span className="text-ink">{sortLabel[issueView.sortBy]}</span>
                </button>
              )}
            />
            <button
              type="button"
              aria-label={issueView.dir === "asc" ? "Sort ascending" : "Sort descending"}
              title={issueView.dir === "asc" ? "Ascending" : "Descending"}
              onClick={() => patchView({ dir: issueView.dir === "asc" ? "desc" : "asc" })}
              className="inline-flex size-7 items-center justify-center rounded-md text-ink-2 hover:bg-hover hover:text-ink"
            >
              {issueView.dir === "asc" ? (
                <ArrowUp aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              ) : (
                <ArrowDown aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              )}
            </button>
          </>
        ) : null}

        {issues.data ? (
          <span className="ms-auto text-sm text-ink-2 tabular-nums">
            {hasFilters(issueView)
              ? `${filtered.length} of ${issues.data.length} ${issues.data.length === 1 ? "issue" : "issues"}`
              : `${issues.data.length} ${issues.data.length === 1 ? "issue" : "issues"}`}
          </span>
        ) : null}
      </div>

      {filterKeys(issueView).length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 px-6 pb-2">
          {filterKeys(issueView).map((key) => (
            <FilterPill key={key} name={filterName(key)} onRemove={() => toggleFilterKey(key)} />
          ))}
          <Button variant="ghost" className="h-6 px-2 text-ui text-ink-2" onClick={clearFilters}>
            Clear
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto" id="issues">
        {loading ? (
          <Loading label="Loading issues" />
        ) : issues.data?.length === 0 ? (
          <PageBody>
            <EmptyState
              title="No issues yet"
              body={`Issues in ${team.name} are numbered ${team.key}-1, ${team.key}-2 and so on. Press C to create one.`}
              action={
                <Button variant="primary" onClick={() => setCreating({})}>
                  New issue <Kbd>C</Kbd>
                </Button>
              }
            />
          </PageBody>
        ) : filtered.length === 0 ? (
          <PageBody>
            <EmptyState
              title="No issues match"
              body={issues.data?.length ? "The team's issues all fall outside these filters." : "Nothing has matched yet."}
              action={issues.data?.length ? (
                <Button variant="ghost" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null}
            />
          </PageBody>
        ) : view === "list" ? (
          <IssueList
            groups={groups}
            statuses={statusList}
            labels={labels.data ?? []}
            issues={issues.data ?? []}
            orgMembers={orgMembers.data ?? []}
            agents={agents.data ?? []}
            focusId={focusId}
            openId={peeked?.id}
            onOpen={openIssue}
            onFocus={setFocusId}
          />
        ) : (
          <IssueBoard
            groups={boardGroups}
            statuses={statusList}
            labels={labels.data ?? []}
            orgMembers={orgMembers.data ?? []}
            agents={agents.data ?? []}
            focusId={focusId}
            onOpen={openIssue}
            onFocus={setFocusId}
            onMove={(issue, statusId) =>
              update.mutate(
                { issue, changes: { statusId } },
                {
                  onSuccess: () =>
                    offerUndo(`${issue.identifier} moved to ${statuses.data?.find((s) => s.id === statusId)?.name ?? "a new status"}`),
                  onError: (error) => toast(error.message),
                },
              )
            }
          />
        )}
      </div>

      {peeked && statuses.data ? (
        <IssuePeek
          orgId={orgId}
          slug={slug}
          myId={membership.member.id}
          issue={peeked}
          statuses={statuses.data}
          members={members}
          orgMembers={orgMembers.data ?? []}
          labels={labels.data ?? []}
          teams={teams.data ?? []}
          agents={agents.data ?? []}
          menu={menu}
          onMenu={setMenu}
          onClose={closePeek}
          onOpen={openLinked}
          onAddSubIssue={() => setCreating({ parent: peeked })}
        />
      ) : null}

      {statuses.data ? (
        <CreateIssueDialog
          orgId={orgId}
          team={team}
          statuses={statuses.data}
          members={members}
          labels={labels.data ?? []}
          parent={creating?.parent}
          open={creating !== null}
          onClose={() => setCreating(null)}
          onCreated={(identifier) => offerUndo(`Created ${identifier}`)}
        />
      ) : null}
    </div>
  );
}

// A group names what its rows share: a status, a priority or an assignee.
function groupKey(group: IssueGroup): string {
  if (group.status) return group.status.id;
  if (group.priority) return `priority:${group.priority}`;
  return group.assignee ? `assignee:${group.assignee.id}` : "unassigned";
}

function groupName(group: IssueGroup): string {
  if (group.status) return group.status.name;
  if (group.priority) return priorityLabel[group.priority];
  return group.assignee ? group.assignee.name : "Unassigned";
}

function GroupHeading({ group, statuses }: { group: IssueGroup; statuses: Status[] }) {
  return (
    <h2 className="flex h-[34px] items-center gap-2 bg-bg px-3 text-sm font-semibold text-ink">
      {group.status ? (
        <StatusIcon category={group.status.category} fill={statusFill(statuses, group.status)} />
      ) : group.priority ? (
        <PriorityIcon priority={group.priority} />
      ) : group.assignee ? (
        <span className="shrink-0">
          <Avatar name={group.assignee.name} size={18} />
        </span>
      ) : (
        <NoAssignee size={18} />
      )}
      <span>{groupName(group)}</span>
      <span className="font-normal text-ink-2 tabular-nums">{group.issues.length}</span>
    </h2>
  );
}

// A removed-in-one-click chip for one active filter value.
function FilterPill({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md bg-hover ps-2 pe-1 text-ui text-ink">
      {name}
      <button
        type="button"
        aria-label={`Remove filter ${name}`}
        onClick={onRemove}
        className="grid size-4 place-items-center rounded-xs text-ink-2 hover:text-ink"
      >
        <X aria-hidden="true" className="size-3" strokeWidth={1.75} />
      </button>
    </span>
  );
}

// The assignee, with the delegate overlapping it as in the concept.
function Assignee({ issue, orgMembers, agents }: { issue: Issue; orgMembers: Member[]; agents: Agent[] }) {
  const assignee = orgMembers.find((m) => m.id === issue.assigneeId);
  const delegate = agents.find((a) => a.id === issue.delegateId);
  return (
    <span className="flex items-center">
      {assignee ? (
        <span title={assignee.name}>
          <Avatar name={assignee.name} />
        </span>
      ) : (
        <span title="No assignee">
          <NoAssignee size={22} />
        </span>
      )}
      {delegate ? (
        <span title={`Delegated to ${delegate.name}`} className="-ms-1.5 rounded-[7px] ring-2 ring-bg">
          <Avatar name={delegate.name} kind="agent" />
        </span>
      ) : null}
    </span>
  );
}

// The delegate's latest words under the title: its name, its state and what
// it last said, or that it has not picked the issue up yet.
function AgentLine({ issue, agents }: { issue: Issue; agents: Agent[] }) {
  const agent = agents.find((a) => a.id === issue.delegateId);
  if (!agent) return null;
  const state = agentState(issue, agent);
  const latest = issue.latestProgress?.agentId === agent.id ? issue.latestProgress : null;
  return (
    <span className="col-span-4 col-start-4 flex min-w-0 items-center gap-2 text-sm">
      <span className="shrink-0 font-medium text-agent-ink">{agent.name}</span>
      <ProgressBadge state={state} />
      <span className="min-w-0 truncate text-ink-2">
        {latest ? plainLine(latest.message) : state === "waiting" ? waitingLine(agent) : null}
      </span>
    </span>
  );
}

function IssueLabels({ issue, labels }: { issue: Issue; labels: Label[] }) {
  const own = labels.filter((label) => issue.labelIds.includes(label.id));
  if (own.length === 0) return <span />;
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {own.map((label) => (
        <LabelPill key={label.id} name={label.name} hue={label.hue} />
      ))}
    </span>
  );
}

function IssueList({
  groups,
  statuses,
  labels,
  issues,
  orgMembers,
  agents,
  focusId,
  openId,
  onOpen,
  onFocus,
}: {
  groups: IssueGroup[];
  statuses: Status[];
  labels: Label[];
  // The whole team's issues, to name a row's parent.
  issues: Issue[];
  orgMembers: Member[];
  agents: Agent[];
  focusId: string | null;
  openId?: string;
  onOpen: (issue: Issue) => void;
  onFocus: (id: string) => void;
}) {
  const parentOf = (issue: Issue) => issues.find((i) => i.id === issue.parentId)?.identifier;
  return (
    <div className="px-3 pb-28">
      {groups.map((group) => (
        <section key={groupKey(group)} aria-label={groupName(group)} className="mb-3">
          <div className="sticky top-0 z-[1]">
            <GroupHeading group={group} statuses={statuses} />
          </div>
          <ul className="flex flex-col gap-px">
            {group.issues.map((issue) => {
              const status = statuses.find((s) => s.id === issue.statusId)!;
              return (
                <li key={issue.id}>
                  <button
                    id={`issue-${issue.id}`}
                    type="button"
                    onClick={() => onOpen(issue)}
                    onFocus={() => onFocus(issue.id)}
                    aria-current={openId === issue.id ? "true" : undefined}
                    data-focused={focusId === issue.id || undefined}
                    className={cn(
                      "relative grid min-h-10 w-full grid-cols-[16px_58px_16px_minmax(0,1fr)_auto_auto_30px] items-center gap-x-3 gap-y-1 rounded-sm py-2 ps-4 pe-3 text-start",
                      agentState(issue, agents.find((a) => a.id === issue.delegateId)) === "working" &&
                        "before:absolute before:inset-y-1.5 before:start-0 before:w-[3px] before:rounded-full before:bg-agent",
                      "transition-[background-color] duration-[140ms] ease-standard hover:bg-hover",
                      "data-focused:bg-hover focus-visible:shadow-[inset_0_0_0_1.5px_var(--ink)] focus-visible:outline-none",
                    )}
                  >
                    <span title={priorityLabel[issue.priority]}>
                      <PriorityIcon priority={issue.priority} />
                    </span>
                    <span className="text-sm font-medium whitespace-nowrap text-ink-2 tabular-nums">{issue.identifier}</span>
                    <span title={status.name}>
                      <StatusIcon category={status.category} fill={statusFill(statuses, status)} />
                    </span>
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span
                        className={cn(
                          "truncate text-body tracking-[-0.005em]",
                          openId === issue.id && "font-semibold",
                        )}
                      >
                        {issue.title}
                      </span>
                      {parentOf(issue) ? (
                        <span className="shrink-0 text-sm text-ink-2">↳ {parentOf(issue)}</span>
                      ) : null}
                    </span>
                    <IssueLabels issue={issue} labels={labels} />
                    <Assignee issue={issue} orgMembers={orgMembers} agents={agents} />
                    <time dateTime={issue.updatedAt} className="text-end text-sm text-ink-2">
                      {ago(issue.updatedAt)}
                    </time>
                    <AgentLine issue={issue} agents={agents} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function IssueBoard({
  groups,
  statuses,
  labels,
  orgMembers,
  agents,
  focusId,
  onOpen,
  onFocus,
  onMove,
}: {
  groups: StatusGroup[];
  statuses: Status[];
  labels: Label[];
  orgMembers: Member[];
  agents: Agent[];
  focusId: string | null;
  onOpen: (issue: Issue) => void;
  onFocus: (id: string) => void;
  onMove: (issue: Issue, statusId: string) => void;
}) {
  const [dragging, setDragging] = useState<Issue | null>(null);
  const [over, setOver] = useState<string | null>(null);
  return (
    <div className="flex h-full gap-3 overflow-x-auto px-3">
      {groups.map((column) => (
        <section
          key={column.status.id}
          aria-label={column.status.name}
          className={cn(
            "flex min-h-0 w-64 shrink-0 flex-col rounded-md transition-[background-color] duration-[140ms] ease-standard",
            over === column.status.id && "bg-hover",
          )}
          onDragOver={(event) => {
            if (!dragging) return;
            event.preventDefault();
            setOver(column.status.id);
          }}
          onDragLeave={() => setOver((id) => (id === column.status.id ? null : id))}
          onDrop={(event) => {
            event.preventDefault();
            setOver(null);
            if (dragging && dragging.statusId !== column.status.id) onMove(dragging, column.status.id);
            setDragging(null);
          }}
        >
          <GroupHeading group={column} statuses={statuses} />
          <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto px-0.5 pt-0.5 pb-28">
            {column.issues.map((issue) => (
              <li key={issue.id}>
                <button
                  id={`issue-${issue.id}`}
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", issue.identifier);
                    setDragging(issue);
                  }}
                  onDragEnd={() => setDragging(null)}
                  onClick={() => onOpen(issue)}
                  onFocus={() => onFocus(issue.id)}
                  data-focused={focusId === issue.id || undefined}
                  className={cn(
                    "flex w-full flex-col gap-2 rounded-md bg-surface px-3 pt-2.5 pb-3 text-start shadow-[inset_0_0_0_1px_var(--line)]",
                    "focus-visible:shadow-[inset_0_0_0_2px_var(--ink)] focus-visible:outline-none data-focused:shadow-[inset_0_0_0_1px_var(--line-strong)]",
                    dragging?.id === issue.id && "opacity-50",
                  )}
                >
                  <span className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink-2 tabular-nums">{issue.identifier}</span>
                    <span title={priorityLabel[issue.priority]}>
                      <PriorityIcon priority={issue.priority} />
                    </span>
                  </span>
                  <span className="text-body leading-[1.35] text-pretty">{issue.title}</span>
                  <span className="flex items-center gap-2">
                    <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                      {labels
                        .filter((label) => issue.labelIds.includes(label.id))
                        .map((label) => (
                          <LabelPill key={label.id} name={label.name} hue={label.hue} />
                        ))}
                    </span>
                    <Assignee issue={issue} orgMembers={orgMembers} agents={agents} />
                  </span>
                  {issue.delegateId ? (
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <ProgressBadge state={agentState(issue, agents.find((a) => a.id === issue.delegateId))} />
                      <span className="min-w-0 truncate text-ink-2">
                        {issue.latestProgress?.agentId === issue.delegateId ? plainLine(issue.latestProgress.message) : null}
                      </span>
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
            {column.issues.length === 0 ? <li className="px-1 py-2 text-sm text-ink-3">Nothing here</li> : null}
          </ul>
        </section>
      ))}
    </div>
  );
}

// /:slug/issue/ENG-12: a link that names an issue by any identifier it has
// had. It opens the issue over its team's list, under its current identifier.
export function IssueLink() {
  const { issueRef = "" } = useParams();
  const { orgId, slug } = useOrg();
  const issue = useIssue(orgId, issueRef);
  if (issue.isPending) return <Loading label="Finding the issue" />;
  if (!issue.data) {
    return (
      <PageBody className="pt-6">
        <EmptyState
          title="Issue not found"
          body={`There's no issue ${issueRef.toUpperCase()}, or it's in a team you can't see.`}
          action={
            <Link to={`/${slug}`} className="text-ui font-medium underline decoration-line-strong underline-offset-4">
              Go to teams
            </Link>
          }
        />
      </PageBody>
    );
  }
  return <Navigate to={`/${slug}/teams/${issue.data.teamId}?issue=${issue.data.identifier}`} replace />;
}
