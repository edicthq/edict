import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import type { Agent, AgentPower, Issue, Member, Webhook, WebhookDelivery } from "@edicthq/client";
import { type AgentState, Avatar, Badge, Button, Dialog, Field, Input, ProgressBadge, Tabs, cn } from "@edicthq/ui";
import { X } from "lucide-react";
import { EmptyState, FormError, GroupHeader, Loading, PageBody, PageHeader } from "../components/shell.js";
import { useToast } from "../components/toast.js";
import { agentState, connectionLine, firstName, plainLine } from "../lib/agents.js";
import { useNow } from "../lib/live.js";
import { ago } from "../lib/issues.js";
import {
  useAgentQueue,
  useAgents,
  useApiKeys,
  useCreateAgent,
  useCreateApiKey,
  useCreateWebhook,
  useDeleteWebhook,
  useDeliveries,
  useMembers,
  usePauseAgent,
  useRedeliver,
  useRevokeApiKey,
  useRotateWebhookSecret,
  useTeams,
  useUpdateAgent,
  useUpdateWebhook,
  useWebhooks,
} from "../lib/queries.js";
import { useOrg } from "./org.js";

const powers: { value: AgentPower; label: string; hint: string }[] = [
  { value: "delete", label: "Delete", hint: "Move issues and comments to the trash, remove links and relations." },
  { value: "settings", label: "Settings", hint: "Create teams, change workflows and labels." },
  { value: "members", label: "Members", hint: "Invite people and manage members." },
  { value: "agents", label: "Agents", hint: "Create and manage agents." },
];

// Agents are members (ADR 0008). Everyone sees the roster: what each agent is
// doing, how much waits for it, what it works on now. Picking one opens its
// panel; admins give runners powers, keys and webhooks there, and anyone who
// may pauses it.
export function AgentsPage() {
  const { orgId, canManage, slug } = useOrg();
  const agents = useAgents(orgId);
  const members = useMembers(orgId);
  const webhooks = useWebhooks(orgId, canManage);
  const [creating, setCreating] = useState(false);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [kind, setKind] = useState<"all" | "connected" | "runners">("all");

  // The rail links to /agents#<id>; the panel keeps ?agent=<id>.
  const selectedId = params.get("agent") ?? (location.hash ? location.hash.slice(1) : null);
  const list = agents.data ?? [];
  const selected = list.find((agent) => agent.id === selectedId);
  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("agent", id);
    else next.delete("agent");
    setParams(next, { replace: true });
    if (location.hash) history.replaceState(null, "", `${location.pathname}?${next}`);
  };
  const shown = list.filter((agent) =>
    kind === "connected" ? agent.connectedBy !== null : kind === "runners" ? agent.connectedBy === null : true,
  );

  return (
    <div className="relative flex min-h-full flex-col">
      <PageHeader
        title="Agents"
        actions={
          <>
            <Link to={`/${slug}/connect`} className="inline-flex h-8 items-center rounded-sm px-3 text-ui font-medium text-ink-2 hover:bg-hover hover:text-ink">
              Connect an agent
            </Link>
            {canManage ? (
              <Button variant="primary" onClick={() => setCreating(true)}>
                New agent
              </Button>
            ) : null}
          </>
        }
      />
      <div role="toolbar" aria-label="Which agents" className="flex min-h-11 items-center gap-3 border-b border-line px-6">
        <Tabs
          label="Which agents"
          variant="segmented"
          value={kind}
          onChange={setKind}
          items={[
            { value: "all", label: "All", count: list.length },
            { value: "connected", label: "Connected", count: list.filter((a) => a.connectedBy !== null).length },
            { value: "runners", label: "Runners", count: list.filter((a) => a.connectedBy === null).length },
          ]}
        />
        <p className="ms-auto hidden text-sm text-ink-2 lg:block">
          Connected agents act for the person who connected them. Runners use API keys.
        </p>
      </div>

      {agents.isPending ? (
        <Loading label="Loading agents" />
      ) : list.length ? (
        <div className="px-3 pt-1">
          <div aria-hidden="true" className="grid h-9 grid-cols-[minmax(0,1.4fr)_120px_64px_minmax(0,1.3fr)_72px] items-center gap-4 px-3 text-sm font-medium text-ink-2">
            <span>Agent</span>
            <span>State</span>
            <span className="text-end">Queue</span>
            <span>Working on</span>
            <span className="text-end">Active</span>
          </div>
          <ul aria-label="Agents" className="flex flex-col gap-px">
            {shown.map((agent) => (
              <li key={agent.id}>
                <RosterRow
                  agent={agent}
                  members={members.data ?? []}
                  selected={agent.id === selected?.id}
                  onSelect={() => select(agent.id === selected?.id ? null : agent.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <PageBody>
          <EmptyState
            title="No agents yet"
            body="Connect an MCP client such as Claude Code, and Edict adds an agent for it. Admins can also add agents for agent runners."
            action={
              <Link to={`/${slug}/connect`} className="text-ui font-medium underline decoration-line-strong underline-offset-4">
                Connect an agent
              </Link>
            }
          />
        </PageBody>
      )}

      {canManage ? (
        <div className="max-w-[860px] px-3 pt-10 pb-28">
          <OrganizationWebhooks webhooks={(webhooks.data ?? []).filter((hook) => !hook.agentId)} />
        </div>
      ) : null}

      {selected ? (
        <AgentPanel
          key={selected.id}
          agent={selected}
          members={members.data ?? []}
          webhooks={(webhooks.data ?? []).filter((hook) => hook.agentId === selected.id)}
          onClose={() => select(null)}
        />
      ) : null}
      {canManage ? <NewAgentDialog open={creating} onClose={() => setCreating(false)} onCreated={(agent) => select(agent.id)} /> : null}
    </div>
  );
}

// What an agent is doing across its queue: paused, or what most needs a person,
// or working, or nothing at all.
function rosterState(agent: Agent, queue: Issue[], now: number): AgentState | "idle" {
  if (agent.pausedAt) return "paused";
  const states = queue.map((issue) => agentState(issue, agent, now));
  if (states.includes("blocked")) return "blocked";
  if (states.includes("needs_input")) return "needs_input";
  if (states.includes("working")) return "working";
  if (states.includes("quiet")) return "quiet";
  return "idle";
}

function lastActive(agent: Agent, queue: Issue[]): string | null {
  const times = queue
    .map((issue) => (issue.latestProgress?.agentId === agent.id ? issue.latestProgress.createdAt : null))
    .filter((time): time is string => time !== null)
    .sort();
  return times.at(-1) ?? null;
}

function RosterRow({ agent, members, selected, onSelect }: { agent: Agent; members: Member[]; selected: boolean; onSelect: () => void }) {
  const { orgId } = useOrg();
  const queue = useAgentQueue(orgId, agent.id).data ?? [];
  const now = useNow();
  const state = rosterState(agent, queue, now);
  const current = queue.find((issue) => agentState(issue, agent, now) === "working") ?? queue[0];
  const active = lastActive(agent, queue);
  return (
    <button
      type="button"
      id={agent.id}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      className={cn(
        "relative grid min-h-12 w-full grid-cols-[minmax(0,1.4fr)_120px_64px_minmax(0,1.3fr)_72px] items-center gap-4 rounded-sm px-3 py-1.5 text-start transition-[background-color] duration-[140ms] ease-standard hover:bg-hover",
        selected && "bg-hover shadow-[inset_2px_0_0_0_var(--ink)]",
        agent.pausedAt && "opacity-60",
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Avatar name={agent.name} kind="agent" />
        <span className="min-w-0">
          <span className="block truncate text-ui font-medium text-agent-ink">{agent.name}</span>
          <span className="block truncate text-sm text-ink-2">{connectionLine(agent, members)}</span>
        </span>
      </span>
      <span>
        {state === "idle" ? <span className="text-sm text-ink-2">Idle</span> : <ProgressBadge state={state} />}
      </span>
      <span className="text-end text-ui tabular-nums">
        {queue.length}
      </span>
      <span className="flex min-w-0 items-baseline gap-1.5 text-ui">
        {current ? (
          <>
            <span className="shrink-0 text-sm font-medium text-ink-2 tabular-nums">{current.identifier}</span>
            <span className="truncate">{current.title}</span>
          </>
        ) : (
          <span className="text-ink-3">—</span>
        )}
      </span>
      <span className="text-end text-sm text-ink-2 tabular-nums">
        {active ? ago(active) : "—"}
      </span>
    </button>
  );
}

// One agent's panel: what it does now and next, then its powers and access.
function AgentPanel({ agent, members, webhooks, onClose }: { agent: Agent; members: Member[]; webhooks: Webhook[]; onClose: () => void }) {
  const { orgId, slug, canManage, membership } = useOrg();
  const queue = useAgentQueue(orgId, agent.id).data ?? [];
  const pause = usePauseAgent(orgId);
  const toast = useToast();
  const human = members.find((m) => m.id === agent.connectedBy);
  const now = useNow();
  const live = queue.find((issue) => agentState(issue, agent, now) === "working");
  // The person who connected an agent can pause it too.
  const mayPause = canManage || agent.connectedBy === membership.member.id;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      aria-label={`${agent.name} details`}
      className="fixed inset-y-2 end-2 z-20 flex w-[min(440px,calc(100vw-16px))] flex-col overflow-hidden rounded-md bg-surface shadow-overlay outline outline-line motion-safe:animate-[peek-slide_220ms_cubic-bezier(0.2,0,0,1)]"
    >
      <header className="flex items-start gap-3 border-b border-line p-4">
        <span className={cn("rounded-[9px]", live && "outline-2 outline-offset-2 outline-agent-edge")}>
          <Avatar name={agent.name} kind="agent" size={32} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-body font-semibold text-agent-ink">{agent.name}</h2>
          <p className="text-sm text-ink-2">{connectionLine(agent, members)}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {agent.pausedAt ? <ProgressBadge state="paused" /> : null}
            <Badge>{agent.role === "guest" ? "Guest" : "Member"}</Badge>
            {agent.grants.map((grant) => (
              <Badge key={grant}>can {powers.find((p) => p.value === grant)?.label.toLowerCase()}</Badge>
            ))}
          </div>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid size-7 shrink-0 place-items-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink"
        >
          <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
        {agent.description ? <p className="text-ui text-ink-2 text-pretty">{agent.description}</p> : null}
        {human ? (
          <p className="text-sm text-ink-2 text-pretty">Sees what {firstName(human.name)} sees, and never does more than they can.</p>
        ) : null}

        {live?.latestProgress ? (
          <section aria-label="Working now" className="rounded-md border border-agent-edge bg-lane p-3">
            <div className="flex items-center gap-2 text-sm">
              <ProgressBadge state="working" />
              <Link to={`/${slug}/issue/${live.identifier}`} className="ms-auto font-medium text-ink-2 tabular-nums hover:text-ink">
                {live.identifier}
              </Link>
            </div>
            <p className="mt-2 text-ui font-medium">{live.title}</p>
            <p className="mt-1.5 border-s-2 border-agent-edge ps-2.5 text-ui text-ink-2 text-pretty">{plainLine(live.latestProgress.message)}</p>
          </section>
        ) : null}

        <section aria-labelledby="agent-queue" className="flex flex-col gap-1">
          <h3 id="agent-queue" className="text-sm font-semibold text-ink-2">
            Queue <span className="font-normal tabular-nums">{queue.length}</span>
          </h3>
          {queue.length ? (
            <ul className="flex flex-col">
              {queue.map((issue) => (
                <li key={issue.id}>
                  <Link
                    to={`/${slug}/issue/${issue.identifier}`}
                    className="flex min-h-8 items-center gap-2 rounded-sm px-1.5 text-ui hover:bg-hover"
                  >
                    <span className="w-14 shrink-0 text-sm font-medium text-ink-2 tabular-nums">{issue.identifier}</span>
                    <span className="truncate">{issue.title}</span>
                    <ProgressBadge state={agentState(issue, agent, now)} className="ms-auto" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">Nothing is delegated to {agent.name} right now.</p>
          )}
        </section>

        {canManage ? <AgentSettings agent={agent} webhooks={webhooks} /> : null}
      </div>

      {mayPause ? (
        <footer className="flex items-center gap-3 border-t border-line p-4">
          <Button
            variant={agent.pausedAt ? "primary" : "secondary"}
            disabled={pause.isPending || (!!agent.pausedAt && !canManage)}
            onClick={() =>
              pause.mutate(
                { agentId: agent.id, pause: !agent.pausedAt },
                {
                  onSuccess: () => toast(agent.pausedAt ? `${agent.name} can act again` : `Paused ${agent.name}. Its tokens are revoked.`),
                  onError: (error) => toast(error.message),
                },
              )
            }
          >
            {agent.pausedAt ? "Resume" : "Pause"}
          </Button>
          <p className="text-sm text-ink-2 text-pretty">
            {agent.pausedAt
              ? "Paused agents can't act until resumed."
              : agent.connectedBy
                ? "Pausing signs it out everywhere until it is resumed."
                : "Pausing revokes its keys and stops its webhook."}
          </p>
        </footer>
      ) : null}
    </aside>
  );
}

// An admin's controls: the name, powers beyond the defaults, and for runners
// their API keys and webhook.
function AgentSettings({ agent, webhooks }: { agent: Agent; webhooks: Webhook[] }) {
  const { orgId } = useOrg();
  const update = useUpdateAgent(orgId);
  const toast = useToast();
  const [name, setName] = useState(agent.name);
  useEffect(() => setName(agent.name), [agent.name]);
  // Ticks show at once; a failed save puts them back.
  const [grants, setGrants] = useState(agent.grants);
  useEffect(() => setGrants(agent.grants), [agent.grants]);
  return (
    <>
      <form
        className="flex items-end gap-2 border-t border-line pt-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() && name.trim() !== agent.name) {
            update.mutate({ agent, changes: { name: name.trim() } }, { onError: (error) => toast(error.message) });
          }
        }}
      >
        <Field label="Name" className="min-w-0 flex-1">
          {(control) => <Input {...control} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />}
        </Field>
        <Button type="submit" variant="ghost" disabled={name.trim() === agent.name || !name.trim()}>
          Rename
        </Button>
      </form>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-ink-2">Powers beyond issues, comments and progress</legend>
        {powers.map((power) => (
          <label key={power.value} className="flex items-start gap-2 text-ui">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--ink)]"
              checked={grants.includes(power.value)}
              disabled={update.isPending}
              onChange={(event) => {
                const next = event.target.checked ? [...grants, power.value] : grants.filter((grant) => grant !== power.value);
                setGrants(next);
                update.mutate(
                  { agent, changes: { grants: next } },
                  {
                    onError: (error) => {
                      setGrants(agent.grants);
                      toast(error.message);
                    },
                  },
                );
              }}
            />
            <span>
              <span className="font-medium">{power.label}</span>
              <span className="block text-ink-2">{power.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {agent.connectedBy ? null : (
        <>
          <ApiKeys agent={agent} />
          <AgentWebhook agent={agent} webhook={webhooks[0]} />
        </>
      )}
    </>
  );
}

function ApiKeys({ agent }: { agent: Agent }) {
  const { orgId } = useOrg();
  const keys = useApiKeys(orgId, agent.id);
  const create = useCreateApiKey(orgId, agent.id);
  const revoke = useRevokeApiKey(orgId, agent.id);
  const toast = useToast();
  const [secret, setSecret] = useState<string | null>(null);

  return (
    <section aria-label={`${agent.name} API keys`} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-ink-2">API keys</h3>
        <Button
          variant="ghost"
          className="ms-auto"
          disabled={!!agent.pausedAt || create.isPending}
          onClick={() =>
            create.mutate(
              { name: `Key ${(keys.data?.length ?? 0) + 1}`, teamIds: null },
              { onSuccess: (created) => setSecret(created.secret), onError: (error) => toast(error.message) },
            )
          }
        >
          New API key
        </Button>
      </div>
      {keys.data?.length ? (
        <ul className="flex flex-col gap-px">
          {keys.data.map((key) => (
            <li key={key.id} className="flex min-h-9 items-center gap-3 rounded-sm px-2 text-ui hover:bg-hover">
              <code className="font-code text-code">{key.prefix}…</code>
              <span className="truncate">{key.name}</span>
              <span className="ms-auto text-sm text-ink-2">{key.lastUsedAt ? (ago(key.lastUsedAt) === "now" ? "used just now" : `used ${ago(key.lastUsedAt)} ago`) : "never used"}</span>
              <Button variant="ghost" onClick={() => revoke.mutate(key.id, { onError: (error) => toast(error.message) })}>
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-2">No keys. An agent runner sends one as a bearer token to the API or /mcp.</p>
      )}
      <SecretDialog
        title="Copy the API key"
        body="It is shown only now. Send it as Authorization: Bearer <key>."
        secret={secret}
        onClose={() => setSecret(null)}
      />
    </section>
  );
}

function AgentWebhook({ agent, webhook }: { agent: Agent; webhook?: Webhook }) {
  const { orgId } = useOrg();
  const create = useCreateWebhook(orgId);
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  return (
    <section aria-label={`${agent.name} webhook`} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-ink-2">Webhook</h3>
      {webhook ? (
        <WebhookRow webhook={webhook} />
      ) : (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate(
              { url: url.trim(), agentId: agent.id, eventTypes: [] },
              {
                onSuccess: (created) => {
                  setSecret(created.secret);
                  setUrl("");
                },
                onError: (error) => toast(error.message) },
            );
          }}
        >
          <Field label="URL" hint="Gets every event on issues delegated to this agent, so its runner starts right away." className="min-w-0 flex-1">
            {(control) => (
              <Input {...control} type="url" required placeholder="https://runner.example.com/edict" value={url} onChange={(event) => setUrl(event.target.value)} />
            )}
          </Field>
          <Button type="submit" variant="ghost" disabled={create.isPending}>
            Add webhook
          </Button>
        </form>
      )}
      <SecretDialog
        title="Copy the signing secret"
        body="It is shown only now. Check each delivery's Edict-Signature with it."
        secret={secret}
        onClose={() => setSecret(null)}
      />
    </section>
  );
}

function OrganizationWebhooks({ webhooks }: { webhooks: Webhook[] }) {
  const { orgId } = useOrg();
  const create = useCreateWebhook(orgId);
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [types, setTypes] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  return (
    <section aria-labelledby="org-webhooks" className="flex flex-col gap-2">
      <GroupHeader count={webhooks.length}>
        <span id="org-webhooks">Organization webhooks</span>
      </GroupHeader>
      <div className="flex flex-col gap-2 px-3">
        {webhooks.map((webhook) => (
          <WebhookRow key={webhook.id} webhook={webhook} />
        ))}
        <form
          className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            const eventTypes = types.split(/[\s,]+/).filter(Boolean);
            create.mutate(
              { url: url.trim(), agentId: null, eventTypes },
              {
                onSuccess: (created) => {
                  setSecret(created.secret);
                  setUrl("");
                  setTypes("");
                },
                onError: (error) => toast(error.message),
              },
            );
          }}
        >
          <Field label="URL">
            {(control) => <Input {...control} type="url" required placeholder="https://example.com/hooks/edict" value={url} onChange={(event) => setUrl(event.target.value)} />}
          </Field>
          <Field label="Event types">
            {(control) => <Input {...control} placeholder="Every type" value={types} onChange={(event) => setTypes(event.target.value)} />}
          </Field>
          <Button type="submit" variant="ghost" disabled={create.isPending}>
            Add webhook
          </Button>
        </form>
      </div>
      <SecretDialog
        title="Copy the signing secret"
        body="It is shown only now. Check each delivery's Edict-Signature with it."
        secret={secret}
        onClose={() => setSecret(null)}
      />
    </section>
  );
}

function WebhookRow({ webhook }: { webhook: Webhook }) {
  const { orgId } = useOrg();
  const update = useUpdateWebhook(orgId);
  const remove = useDeleteWebhook(orgId);
  const rotate = useRotateWebhookSecret(orgId);
  const toast = useToast();
  const [log, setLog] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const fail = (error: Error) => toast(error.message);
  return (
    <div className="rounded-sm shadow-[inset_0_0_0_1px_var(--line)]">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <code className="min-w-0 truncate font-code text-code">{webhook.url}</code>
        {webhook.disabledAt ? <Badge title={webhook.disabledReason ?? undefined}>Off</Badge> : null}
        {webhook.eventTypes.length ? <span className="truncate text-sm text-ink-2">{webhook.eventTypes.join(", ")}</span> : null}
        <span className="ms-auto flex items-center gap-1">
          <Button variant="ghost" aria-expanded={log} onClick={() => setLog(!log)}>
            Deliveries
          </Button>
          <Button variant="ghost" onClick={() => update.mutate({ webhook, changes: { enabled: !!webhook.disabledAt } }, { onError: fail })}>
            {webhook.disabledAt ? "Turn on" : "Turn off"}
          </Button>
          <Button variant="ghost" onClick={() => rotate.mutate(webhook.id, { onSuccess: (r) => setSecret(r.secret), onError: fail })}>
            New secret
          </Button>
          <Button variant="ghost" onClick={() => remove.mutate(webhook.id, { onError: fail })}>
            Delete
          </Button>
        </span>
      </div>
      {webhook.disabledAt && webhook.disabledReason ? (
        <p className="border-t border-line bg-warn-wash px-3 py-2 text-sm text-ink">{webhook.disabledReason}</p>
      ) : null}
      {log ? <Deliveries webhookId={webhook.id} /> : null}
      <SecretDialog
        title="Copy the new signing secret"
        body="It is shown only now. The old secret no longer signs deliveries."
        secret={secret}
        onClose={() => setSecret(null)}
      />
    </div>
  );
}

function Deliveries({ webhookId }: { webhookId: string }) {
  const { orgId } = useOrg();
  const deliveries = useDeliveries(orgId, webhookId);
  const redeliver = useRedeliver(orgId, webhookId);
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  if (deliveries.isPending) return <p className="border-t border-line px-3 py-2 text-sm text-ink-2">Loading deliveries…</p>;
  if (!deliveries.data?.length) return <p className="border-t border-line px-3 py-2 text-sm text-ink-2">No deliveries in the last 30 days.</p>;
  return (
    <ul className="border-t border-line">
      {deliveries.data.map((delivery: WebhookDelivery) => (
        <li key={delivery.id} className="border-b border-line last:border-b-0">
          <button
            type="button"
            aria-expanded={open === delivery.id}
            onClick={() => setOpen(open === delivery.id ? null : delivery.id)}
            className="flex w-full items-center gap-3 px-3 py-2 text-start text-ui hover:bg-hover"
          >
            <span
              className={cn(
                "w-16 shrink-0 text-sm font-medium",
                delivery.status === "delivered" ? "text-ink-2" : delivery.status === "failed" ? "text-danger" : "text-warn",
              )}
            >
              {delivery.status === "delivered" ? delivery.responseStatus : delivery.status === "failed" ? "Failed" : "Pending"}
            </span>
            <span className="truncate">{delivery.eventType}</span>
            {delivery.redeliveryOf ? <Badge>redelivery</Badge> : null}
            <span className="ms-auto shrink-0 text-sm text-ink-2">
              {delivery.attempts} {delivery.attempts === 1 ? "attempt" : "attempts"} · {ago(delivery.createdAt)}
            </span>
          </button>
          {open === delivery.id ? (
            <div className="flex flex-col gap-2 px-3 pb-3">
              <p className="text-sm font-semibold text-ink-2">Request</p>
              <pre className="max-h-48 overflow-auto rounded-sm bg-bg p-2 font-code text-code">{pretty(delivery.requestBody)}</pre>
              <p className="text-sm font-semibold text-ink-2">
                Response {delivery.responseStatus ?? ""} {delivery.durationMs !== null ? `· ${delivery.durationMs} ms` : ""}
              </p>
              <pre className="max-h-32 overflow-auto rounded-sm bg-bg p-2 font-code text-code">{delivery.responseBody ?? "None yet."}</pre>
              <Button
                variant="ghost"
                className="self-start"
                onClick={() => redeliver.mutate(delivery.id, { onSuccess: () => toast("Sent again"), onError: (error) => toast(error.message) })}
              >
                Redeliver
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function pretty(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

function SecretDialog({ title, body, secret, onClose }: { title: string; body: string; secret: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={secret !== null} onClose={onClose} title={title}>
      <div className="flex flex-col gap-3 p-5">
        <p className="text-ui text-ink-2 text-pretty">{body}</p>
        <code className="break-all rounded-sm bg-bg px-3 py-2 font-code text-code">
          {secret}
        </code>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => void navigator.clipboard?.writeText(secret ?? "").then(() => setCopied(true))}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function NewAgentDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (agent: Agent) => void }) {
  const { orgId } = useOrg();
  const create = useCreateAgent(orgId);
  const teams = useTeams(orgId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const reset = () => {
    setName("");
    setDescription("");
    setTeamIds([]);
    setFailure(null);
  };
  return (
    <Dialog open={open} onClose={onClose} title="New agent">
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(
            { name: name.trim(), description, role: "member", teamIds, grants: [] },
            {
              onSuccess: (agent) => {
                reset();
                onClose();
                onCreated(agent);
              },
              onError: (error) => setFailure(error.message),
            },
          );
        }}
      >
        <p className="text-ui text-ink-2 text-pretty">
          For an agent runner: a server running Claude Code headless, the Agent SDK, CI. Give it an API key after.
          People connecting their own MCP client don't need this.
        </p>
        <Field label="Name">{(control) => <Input {...control} autoFocus required maxLength={80} placeholder="Ferro" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="What it does" hint="Optional">
          {(control) => <Input {...control} maxLength={2000} placeholder="Fixes failing CI runs" value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-ui font-medium">Teams</legend>
          <p className="text-sm text-ink-2">Like a Member, it sees every public team. Add it to private ones here.</p>
          {(teams.data ?? []).map((team) => (
            <label key={team.id} className="flex items-center gap-2 text-ui">
              <input
                type="checkbox"
                className="size-4 accent-[var(--ink)]"
                checked={teamIds.includes(team.id)}
                onChange={(e) => setTeamIds(e.target.checked ? [...teamIds, team.id] : teamIds.filter((id) => id !== team.id))}
              />
              {team.name}
              {team.private ? <Badge>Private</Badge> : null}
            </label>
          ))}
        </fieldset>
        <FormError message={failure} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={create.isPending || !name.trim()}>
            Create agent
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
