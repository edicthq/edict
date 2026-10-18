import { useState } from "react";
import { Link } from "react-router";
import type { Issue } from "@edicthq/client";
import { Avatar, Button, PriorityIcon, StatusIcon, TeamKey, cn } from "@edicthq/ui";
import { CheckSquare, UserCheck, Bot } from "lucide-react";
import { EmptyState, GroupHeader, Loading, PageBody, PageHeader, rowClass } from "../components/shell.js";
import { useMembers, useMyWork, useTeams } from "../lib/queries.js";
import { ago } from "../lib/issues.js";
import { useOrg } from "./org.js";

export function MyIssuesPage() {
  const { orgId, slug, membership } = useOrg();
  const [include, setInclude] = useState<"open" | "all">("open");
  const [tab, setTab] = useState<"all" | "assigned" | "delegated">("all");

  const myWork = useMyWork(orgId, include);
  const teams = useTeams(orgId);
  const members = useMembers(orgId);

  const teamMap = new Map((teams.data ?? []).map((t) => [t.id, t]));
  const memberMap = new Map((members.data ?? []).map((m) => [m.id, m]));
  const myId = membership.member.id;

  const allIssues = myWork.data ?? [];
  const filtered = allIssues.filter((issue) => {
    if (tab === "assigned") return issue.assigneeId === myId;
    if (tab === "delegated") return issue.delegateId === myId;
    return true;
  });

  return (
    <>
      <PageHeader
        title="My issues"
        actions={
          <div className="flex items-center gap-1 rounded-sm border border-line bg-surface p-0.5 text-ui">
            <button
              type="button"
              onClick={() => setInclude("open")}
              className={cn(
                "rounded-xs px-2.5 py-1 text-sm font-medium transition-[background-color,color]",
                include === "open" ? "bg-hover text-ink" : "text-ink-2 hover:text-ink",
              )}
            >
              Open
            </button>
            <button
              type="button"
              onClick={() => setInclude("all")}
              className={cn(
                "rounded-xs px-2.5 py-1 text-sm font-medium transition-[background-color,color]",
                include === "all" ? "bg-hover text-ink" : "text-ink-2 hover:text-ink",
              )}
            >
              All
            </button>
          </div>
        }
      />

      <PageBody>
        <div className="flex items-center gap-1 border-b border-line px-3 pb-2 text-ui mb-3">
          <button
            type="button"
            onClick={() => setTab("all")}
            className={cn(
              "rounded-sm px-2.5 py-1 text-sm font-medium transition-[color,background-color]",
              tab === "all" ? "bg-hover text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            All ({allIssues.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("assigned")}
            className={cn(
              "rounded-sm px-2.5 py-1 text-sm font-medium transition-[color,background-color]",
              tab === "assigned" ? "bg-hover text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            Assigned to me ({allIssues.filter((i) => i.assigneeId === myId).length})
          </button>
          <button
            type="button"
            onClick={() => setTab("delegated")}
            className={cn(
              "rounded-sm px-2.5 py-1 text-sm font-medium transition-[color,background-color]",
              tab === "delegated" ? "bg-hover text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            Delegated to me ({allIssues.filter((i) => i.delegateId === myId).length})
          </button>
        </div>

        {myWork.isPending ? (
          <Loading label="Loading your work" />
        ) : filtered.length ? (
          <ul className="flex flex-col gap-px">
            {filtered.map((issue) => {
              const team = teamMap.get(issue.teamId);
              const assignee = issue.assigneeId ? memberMap.get(issue.assigneeId) : null;
              return (
                <li key={issue.id}>
                  <Link
                    to={`/${slug}/teams/${issue.teamId}?peek=${issue.identifier}`}
                    className={cn(
                      rowClass,
                      "grid grid-cols-[auto_16px_minmax(0,1fr)_auto_auto] items-center gap-3",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {team ? <TeamKey>{team.key}</TeamKey> : null}
                      <span className="text-sm font-medium text-ink-2 tabular-nums">
                        {issue.identifier}
                      </span>
                    </div>

                    <PriorityIcon priority={issue.priority} />

                    <span className="truncate text-body tracking-[-0.005em] text-ink font-medium">
                      {issue.title}
                    </span>

                    <div className="flex items-center gap-2">
                      {issue.delegateId === myId ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-agent-wash px-2 py-0.5 text-xs font-medium text-agent-ink">
                          <Bot aria-hidden="true" className="size-3" />
                          delegated
                        </span>
                      ) : null}
                      {assignee && assignee.id !== myId ? (
                        <div className="flex items-center gap-1 text-sm text-ink-2" title={`Assignee: ${assignee.name}`}>
                          <Avatar name={assignee.name} />
                          <span className="truncate max-w-[80px] hidden sm:inline">{assignee.name}</span>
                        </div>
                      ) : null}
                    </div>

                    <time dateTime={issue.updatedAt} className="text-end text-sm text-ink-3">
                      {ago(issue.updatedAt)}
                    </time>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="All clear"
            body={
              include === "open"
                ? "You have no open issues assigned or delegated to you."
                : "No issues have been assigned or delegated to you."
            }
          />
        )}
      </PageBody>
    </>
  );
}
