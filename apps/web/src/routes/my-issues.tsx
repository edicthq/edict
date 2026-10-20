import { useState } from "react";
import { Link } from "react-router";
import { Tabs } from "@edicthq/ui";
import { CircleCheck } from "lucide-react";
import { IssueRowLink } from "../components/issue-row.js";
import { EmptyState, Loading, PageBody, PageHeader } from "../components/shell.js";
import { useAgents, useMembers, useMyWork, useOrgIssueContext, useTeams } from "../lib/queries.js";
import { useOrg } from "./org.js";

export function MyIssuesPage() {
  const { orgId, slug, membership } = useOrg();
  const [include, setInclude] = useState<"open" | "all">("open");
  const [tab, setTab] = useState<"all" | "delegated">("all");

  const myWork = useMyWork(orgId, include);
  const teams = useTeams(orgId);
  const members = useMembers(orgId);

  const agents = useAgents(orgId);
  const context = useOrgIssueContext(orgId);
  const myId = membership.member.id;

  const allIssues = myWork.data ?? [];
  // A person is never a delegate, so their second tab is what they answer for
  // that an agent is doing.
  const withAgent = (issue: (typeof allIssues)[number]) => issue.assigneeId === myId && issue.delegateId !== null;
  const filtered = allIssues.filter((issue) => (tab === "delegated" ? withAgent(issue) : true));

  return (
    <>
      <PageHeader
        title="My issues"
        actions={
          <Tabs
            label="Issue state"
            variant="segmented"
            value={include}
            onChange={setInclude}
            items={[
              { value: "open", label: "Open" },
              { value: "all", label: "All" },
            ]}
          />
        }
      />

      <PageBody>
        <Tabs
          label="Which issues"
          className="mb-3"
          value={tab}
          onChange={setTab}
          items={[
            { value: "all", label: "All", count: allIssues.length },
            { value: "delegated", label: "With an agent", count: allIssues.filter(withAgent).length },
          ]}
        />

        {myWork.isPending ? (
          <Loading label="Loading your work" />
        ) : filtered.length ? (
          <ul className="flex flex-col gap-px">
            {filtered.map((issue) => (
              <li key={issue.id}>
                <IssueRowLink
                  to={`/${slug}/teams/${issue.teamId}?issue=${issue.identifier}`}
                  issue={issue}
                  statuses={context.statuses.filter((s) => s.teamId === issue.teamId)}
                  labels={context.labels}
                  orgMembers={members.data ?? []}
                  agents={agents.data ?? []}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            layout="page"
            icon={<CircleCheck aria-hidden="true" />}
            title="All clear"
            body={
              include === "open"
                ? "You have no open issues assigned or delegated to you."
                : "No issues have been assigned or delegated to you."
            }
            action={
              teams.data?.[0] ? (
                <Link to={`/${slug}/teams/${teams.data[0].id}`} className="text-ui font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                  Browse {teams.data[0].name}
                </Link>
              ) : null
            }
          />
        )}
      </PageBody>
    </>
  );
}
