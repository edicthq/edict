import { useState } from "react";
import type { Agent, Issue, Member, ProgressUpdate } from "@edicthq/client";
import { Avatar, Button, ProgressBadge } from "@edicthq/ui";
import { GitPullRequest } from "lucide-react";
import { Link } from "react-router";
import { connectionLine, firstName, waitingLine, workOnPhrase } from "../lib/agents.js";
import { ago } from "../lib/issues.js";
import { useProgress } from "../lib/queries.js";
import { DelegatePicker } from "./issue-fields.js";
import { Markdown } from "./markdown.js";

// The peek's agent lane, from the C2 concept: the delegate's progress as it
// streams in, or how to get an agent onto the issue.
export function AgentLane({
  orgId,
  slug,
  issue,
  agents,
  members,
  onDelegate,
}: {
  orgId: string;
  slug: string;
  issue: Issue;
  agents: Agent[];
  members: Member[];
  onDelegate: (agentId: string | null) => void;
}) {
  const progress = useProgress(orgId, issue.id);
  // Newest first, as the API returns them.
  const all = progress.data ?? [];
  const delegate = agents.find((agent) => agent.id === issue.delegateId);
  // An agent can post progress on an issue that was never delegated to it.
  // Showing that work is better than claiming no agent touched the issue.
  const lastAgent = agents.find((agent) => agent.id === all[0]?.agentId);
  const agent = delegate ?? lastAgent;
  const updates = agent ? all.filter((update) => update.agentId === agent.id).reverse() : [];

  return (
    <section
      aria-labelledby="agent-lane"
      className="flex min-h-0 flex-col border-line bg-lane max-lg:border-t lg:w-[340px] lg:shrink-0 lg:border-s"
    >
      <h2 id="agent-lane" className="sr-only">
        Agent lane
      </h2>
      {agent ? (
        <AgentLaneBody
          slug={slug}
          issue={issue}
          agent={agent}
          updates={updates}
          members={members}
        />
      ) : (
        <EmptyLane slug={slug} issue={issue} agents={agents} members={members} onDelegate={onDelegate} />
      )}
    </section>
  );
}

function AgentLaneBody({
  slug,
  issue,
  agent,
  updates,
  members,
}: {
  slug: string;
  issue: Issue;
  agent: Agent;
  updates: ProgressUpdate[];
  members: Member[];
}) {
  const human = members.find((m) => m.id === agent.connectedBy);
  // The lane's state follows this agent's own updates, whether or not it is
  // the issue's delegate.
  const state = agent.pausedAt ? "paused" : (updates.at(-1)?.state ?? "waiting");
  return (
    <>
      <header className="flex items-start gap-3 border-b border-line px-4 py-4">
        <Avatar name={agent.name} kind="agent" size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold">{agent.name}</p>
          <p className="truncate text-sm text-ink-2">
            {human ? `on behalf of ${firstName(human.name)}` : agent.webhook ? "runner · starts right away" : "runner"}
          </p>
        </div>
        <ProgressBadge state={state} />
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {updates.length === 0 ? (
          <WaitingNote issue={issue} agent={agent} slug={slug} />
        ) : (
          <ol className="flex flex-col gap-4">
            {updates.map((update) => (
              <ProgressEntry key={update.id} update={update} />
            ))}
          </ol>
        )}
        {state === "working" ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-agent-ink" role="status">
            <span aria-hidden="true" className="flex gap-0.5">
              <span className="size-1.5 rounded-full bg-agent motion-safe:animate-pulse" />
              <span className="size-1.5 rounded-full bg-agent motion-safe:animate-pulse [animation-delay:150ms]" />
              <span className="size-1.5 rounded-full bg-agent motion-safe:animate-pulse [animation-delay:300ms]" />
            </span>
            {agent.name} is working
          </p>
        ) : null}
      </div>
    </>
  );
}

function ProgressEntry({ update }: { update: ProgressUpdate }) {
  return (
    <li className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-2">
      <time dateTime={update.createdAt} title={new Date(update.createdAt).toLocaleString()} className="pt-0.5 text-sm text-ink-2 tabular-nums">
        {ago(update.createdAt)}
      </time>
      <div className="min-w-0 border-s-2 border-agent-edge ps-3">
        {update.state !== "working" ? <ProgressBadge state={update.state} className="mb-1.5" /> : null}
        <Markdown text={update.message} className="text-ui" />
        {update.links.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {update.links.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-sm bg-surface px-2 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-hover"
                >
                  <GitPullRequest aria-hidden="true" className="size-3 shrink-0" strokeWidth={2} />
                  <span className="truncate">{link.title ?? link.url}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

// A connected agent starts when its person asks; a runner when its webhook
// fires or it next checks in.
function WaitingNote({ issue, agent, slug }: { issue: Issue; agent: Agent; slug: string }) {
  if (agent.pausedAt) {
    return (
      <p className="text-ui text-ink-2 text-pretty">
        {agent.name} is paused, so it won't pick this up. An admin can resume it under{" "}
        <Link to={`/${slug}/agents`} className="underline decoration-line-strong underline-offset-2 hover:text-ink">
          Agents
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ui font-medium">{waitingLine(agent)}</p>
      {agent.connectedBy ? (
        <AskBox identifier={issue.identifier} lead={`Ask ${agent.clientName ?? agent.name} to start:`} />
      ) : (
        <p className="text-ui text-ink-2 text-pretty">
          {agent.webhook ? "Its runner was told and starts right away." : "Its runner picks it up the next time it runs."}
        </p>
      )}
    </div>
  );
}

function EmptyLane({
  slug,
  issue,
  agents,
  members,
  onDelegate,
}: {
  slug: string;
  issue: Issue;
  agents: Agent[];
  members: Member[];
  onDelegate: (agentId: string | null) => void;
}) {
  const assignee = members.find((m) => m.id === issue.assigneeId);
  const active = agents.filter((agent) => !agent.pausedAt);
  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
      <div>
        <p className="text-ui font-semibold">No agent yet</p>
        <p className="mt-1 text-ui text-ink-2 text-pretty">
          Delegate this issue and the agent's progress streams here
          {assignee ? `, while ${firstName(assignee.name)} stays accountable.` : "."}
        </p>
      </div>

      {active.length ? (
        <DelegatePicker
          agents={agents}
          members={members}
          value={issue.delegateId}
          onChange={onDelegate}
          trigger={(props) => (
            <Button {...props} variant="secondary" className="self-start">
              Delegate to an agent
            </Button>
          )}
        />
      ) : (
        <Link
          to={`/${slug}/connect`}
          className="text-ui font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
        >
          Connect an MCP client
        </Link>
      )}

      <AskBox identifier={issue.identifier} lead="Or ask an agent connected to Edict:" />

      {active.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink-2">Agents here</h3>
          {active.map((agent) => (
            <div key={agent.id} className="flex items-start gap-2.5 rounded-sm bg-surface px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]">
              <Avatar name={agent.name} kind="agent" size={22} />
              <div className="min-w-0">
                <p className="truncate text-ui font-medium">{agent.name}</p>
                <p className="text-sm text-ink-2 text-pretty">{connectionLine(agent, members)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AskBox({ identifier, lead }: { identifier: string; lead: string }) {
  const phrase = workOnPhrase(identifier);
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-sm bg-surface p-3 shadow-[inset_0_0_0_1px_var(--line)]">
      <p className="text-sm text-ink-2">{lead}</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xs bg-bg px-2 py-1 font-code text-code">{phrase}</code>
        <Button
          variant="ghost"
          onClick={() => {
            void navigator.clipboard?.writeText(phrase).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
