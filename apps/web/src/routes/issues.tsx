import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import type { Issue, Label, Member, Status, Team } from "@edicthq/client";
import { Avatar, Button, Kbd, LabelPill, PriorityIcon, StatusIcon, TeamKey, cn } from "@edicthq/ui";
import { CreateIssueDialog } from "../components/create-issue-dialog.js";
import { NoAssignee } from "../components/issue-fields.js";
import { IssuePeek, type PeekMenu } from "../components/issue-peek.js";
import { EmptyState, Loading, PageBody, PageHeader } from "../components/shell.js";
import { useToast } from "../components/toast.js";
import { useOfferUndo } from "../components/undo.js";
import { ago, assignable, boardColumns, listGroups, priorityLabel, statusFill, type StatusGroup } from "../lib/issues.js";
import {
  useIssue,
  useMembers,
  useStatuses,
  useTeamIssues,
  useTeamLabels,
  useTeamMembers,
  useTeams,
  useUpdateIssue,
} from "../lib/queries.js";
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
  const update = useUpdateIssue(orgId);
  const toast = useToast();
  const offerUndo = useOfferUndo();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "board" ? "board" : "list";
  const peekRef = params.get("issue");
  // The create dialog, and the issue it makes a sub-issue of.
  const [creating, setCreating] = useState<{ parent?: Issue } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [menu, setMenu] = useState<PeekMenu>(null);

  const groups = useMemo<StatusGroup[]>(() => {
    if (!statuses.data || !issues.data) return [];
    return view === "list" ? listGroups(statuses.data, issues.data) : boardColumns(statuses.data, issues.data);
  }, [statuses.data, issues.data, view]);
  // Keyboard order: down the list, or down each board column in turn.
  const order = useMemo(() => groups.flatMap((g) => g.issues), [groups]);
  const members = useMemo(
    () => assignable(team, orgMembers.data ?? [], teamMembers.data ?? []),
    [team, orgMembers.data, teamMembers.data],
  );

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
    } else if (key === "v") {
      event.preventDefault();
      setParam("view", view === "list" ? "board" : null);
    } else if (peeked && (key === "s" || key === "p" || key === "a")) {
      event.preventDefault();
      setMenu(key === "s" ? "status" : key === "p" ? "priority" : "assignee");
    }
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const loading = statuses.isPending || issues.isPending;
  const statusList = statuses.data ?? [];

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
      <div className="flex items-center gap-3 px-6 pb-2">
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
        {issues.data ? (
          <span className="text-sm text-ink-2 tabular-nums">
            {issues.data.length} {issues.data.length === 1 ? "issue" : "issues"}
          </span>
        ) : null}
      </div>

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
        ) : view === "list" ? (
          <IssueList
            groups={groups}
            statuses={statusList}
            labels={labels.data ?? []}
            issues={issues.data ?? []}
            orgMembers={orgMembers.data ?? []}
            focusId={focusId}
            openId={peeked?.id}
            onOpen={openIssue}
            onFocus={setFocusId}
          />
        ) : (
          <IssueBoard
            groups={groups}
            statuses={statusList}
            labels={labels.data ?? []}
            orgMembers={orgMembers.data ?? []}
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
          myId={membership.member.id}
          issue={peeked}
          statuses={statuses.data}
          members={members}
          orgMembers={orgMembers.data ?? []}
          labels={labels.data ?? []}
          teams={teams.data ?? []}
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

function GroupHeading({ group, statuses }: { group: StatusGroup; statuses: Status[] }) {
  return (
    <h2 className="flex h-[34px] items-center gap-2 bg-bg px-3 text-sm font-semibold text-ink">
      <StatusIcon category={group.status.category} fill={statusFill(statuses, group.status)} />
      <span>{group.status.name}</span>
      <span className="font-normal text-ink-2 tabular-nums">{group.issues.length}</span>
    </h2>
  );
}

function Assignee({ issue, orgMembers }: { issue: Issue; orgMembers: Member[] }) {
  const assignee = orgMembers.find((m) => m.id === issue.assigneeId);
  return assignee ? (
    <span title={assignee.name}>
      <Avatar name={assignee.name} />
    </span>
  ) : (
    <span title="No assignee">
      <NoAssignee size={22} />
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
  focusId,
  openId,
  onOpen,
  onFocus,
}: {
  groups: StatusGroup[];
  statuses: Status[];
  labels: Label[];
  // The whole team's issues, to name a row's parent.
  issues: Issue[];
  orgMembers: Member[];
  focusId: string | null;
  openId?: string;
  onOpen: (issue: Issue) => void;
  onFocus: (id: string) => void;
}) {
  const parentOf = (issue: Issue) => issues.find((i) => i.id === issue.parentId)?.identifier;
  return (
    <div className="px-3 pb-28">
      {groups.map((group) => (
        <section key={group.status.id} aria-label={group.status.name} className="mb-3">
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
                      "grid min-h-10 w-full grid-cols-[16px_58px_16px_minmax(0,1fr)_auto_auto_30px] items-center gap-x-3 rounded-sm py-2 ps-4 pe-3 text-start",
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
                    <Assignee issue={issue} orgMembers={orgMembers} />
                    <time dateTime={issue.updatedAt} className="text-end text-sm text-ink-2">
                      {ago(issue.updatedAt)}
                    </time>
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
  focusId,
  onOpen,
  onFocus,
  onMove,
}: {
  groups: StatusGroup[];
  statuses: Status[];
  labels: Label[];
  orgMembers: Member[];
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
                    <Assignee issue={issue} orgMembers={orgMembers} />
                  </span>
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
