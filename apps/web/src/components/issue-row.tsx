import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Agent, Issue, Label, Member, Status } from "@edicthq/client";
import { Avatar, LabelPill, PriorityIcon, ProgressBadge, StatusIcon, cn } from "@edicthq/ui";
import { agentState, plainLine, waitingLine } from "../lib/agents.js";
import { ago, statusFill } from "../lib/issues.js";
import { NoAssignee } from "./issue-fields.js";

// One issue on one row, the same wherever issues are listed: a team's list,
// My issues, a project. Priority, identifier, status, title, labels, the
// people on it and how long ago it changed, with the delegate's latest words
// on a second line. The 3px bar on the leading edge turns the agent color
// while its run is live.
//
// On a phone the same cells fall into two lines: the status and a title that
// wraps, then priority, identifier, two labels and the people under it, with
// the agent line below that. The age goes.
export const issueRowClass =
  "relative grid min-h-10 w-full grid-cols-[16px_58px_16px_minmax(0,1fr)_auto_auto_30px] items-center gap-x-3 gap-y-1 rounded-sm py-2 ps-4 pe-3 text-start transition-[background-color] duration-[140ms] ease-standard hover:bg-hover max-sm:grid-cols-[14px_16px_auto_minmax(0,1fr)_auto] max-sm:gap-x-2 max-sm:gap-y-1.5 max-sm:rounded-none max-sm:border-b max-sm:border-line max-sm:py-3 max-sm:pe-4";

export function liveClass(issue: Issue, agents: Agent[]): string | false {
  return (
    agentState(issue, agents.find((a) => a.id === issue.delegateId)) === "working" &&
    "before:absolute before:inset-y-1.5 before:start-0 before:w-[3px] before:rounded-full before:bg-agent"
  );
}

export interface IssueRowProps {
  issue: Issue;
  // The issue's team's statuses; the status icon fills by stage among them.
  statuses: Status[];
  labels: Label[];
  orgMembers: Member[];
  agents: Agent[];
  // What leads the row: the priority icon unless the list puts a select box
  // over it.
  lead?: ReactNode;
  // After the title, like the parent of a sub-issue.
  titleAside?: ReactNode;
  emphasis?: boolean;
}

export function IssueRowCells({ issue, statuses, labels, orgMembers, agents, lead, titleAside, emphasis }: IssueRowProps) {
  const status = statuses.find((s) => s.id === issue.statusId);
  return (
    <>
      <span className="flex size-4 items-center justify-center max-sm:col-start-2 max-sm:row-start-2">
        {lead ?? <PriorityIcon priority={issue.priority} />}
      </span>
      <span className="text-sm font-medium whitespace-nowrap text-ink-2 tabular-nums max-sm:col-start-3 max-sm:row-start-2">
        {issue.identifier}
      </span>
      <span title={status?.name} className="max-sm:col-start-1 max-sm:row-start-1 max-sm:mt-[3px] max-sm:self-start">
        {status ? <StatusIcon category={status.category} fill={statusFill(statuses, status)} /> : <span className="block size-3.5" />}
      </span>
      <span className="flex min-w-0 items-baseline gap-2 max-sm:col-span-4 max-sm:col-start-2 max-sm:row-start-1">
        <span
          className={cn(
            "truncate text-body tracking-[-0.005em] max-sm:line-clamp-2 max-sm:whitespace-normal",
            emphasis && "font-semibold",
          )}
        >
          {issue.title}
        </span>
        {titleAside}
      </span>
      <IssueLabels issue={issue} labels={labels} className="max-sm:col-start-4 max-sm:row-start-2" />
      <span className="max-sm:col-start-5 max-sm:row-start-2">
        <IssuePeople issue={issue} orgMembers={orgMembers} agents={agents} />
      </span>
      <time dateTime={issue.updatedAt} className="text-end text-sm text-ink-2 max-sm:hidden">
        {ago(issue.updatedAt)}
      </time>
      <AgentLine issue={issue} agents={agents} />
    </>
  );
}

// A row that opens the issue over its team's list, for lists outside a team.
export function IssueRowLink({ to, ...props }: IssueRowProps & { to: string }) {
  return (
    <Link to={to} className={cn(issueRowClass, liveClass(props.issue, props.agents))}>
      <IssueRowCells {...props} />
    </Link>
  );
}

// The assignee, then the delegate beside it. They sit apart rather than
// overlapping, so the human's initials stay readable.
export function IssuePeople({
  issue,
  orgMembers,
  agents,
  size = 22,
}: {
  issue: Issue;
  orgMembers: Member[];
  agents: Agent[];
  size?: 18 | 22;
}) {
  const assignee = orgMembers.find((m) => m.id === issue.assigneeId);
  const delegate = agents.find((a) => a.id === issue.delegateId);
  return (
    <span className="flex items-center gap-[3px]">
      {assignee ? (
        <span title={assignee.name}>
          <Avatar name={assignee.name} size={size} />
        </span>
      ) : (
        <span title="No assignee">
          <NoAssignee size={size} />
        </span>
      )}
      {delegate ? (
        <span title={`Delegated to ${delegate.name}`}>
          <Avatar name={delegate.name} kind="agent" size={size} />
        </span>
      ) : null}
    </span>
  );
}

// The delegate's latest words under the title: its name, its state and what
// it last said, or that it has not picked the issue up yet.
export function AgentLine({ issue, agents }: { issue: Issue; agents: Agent[] }) {
  const agent = agents.find((a) => a.id === issue.delegateId);
  if (!agent) return null;
  const state = agentState(issue, agent);
  const latest = issue.latestProgress?.agentId === agent.id ? issue.latestProgress : null;
  return (
    <span className="col-span-4 col-start-4 flex min-w-0 items-center gap-2 text-sm max-sm:col-start-2 max-sm:row-start-3">
      <span className="shrink-0 font-medium text-agent-ink">{agent.name}</span>
      <ProgressBadge state={state} />
      <span className="min-w-0 truncate text-ink-2">
        {latest ? plainLine(latest.message) : state === "waiting" ? waitingLine(agent) : null}
      </span>
    </span>
  );
}

// On a phone, two labels as plain dots and names, no outline.
export function IssueLabels({ issue, labels, className }: { issue: Issue; labels: Label[]; className?: string }) {
  const own = labels.filter((label) => issue.labelIds.includes(label.id));
  if (own.length === 0) return <span className={className} />;
  return (
    <span
      className={cn(
        "flex flex-wrap justify-end gap-1 max-sm:min-w-0 max-sm:flex-nowrap max-sm:justify-start max-sm:gap-2 max-sm:overflow-hidden max-sm:[&>*:nth-child(n+3)]:hidden",
        className,
      )}
    >
      {own.map((label) => (
        <LabelPill key={label.id} name={label.name} hue={label.hue} className="max-sm:p-0 max-sm:shadow-none" />
      ))}
    </span>
  );
}
