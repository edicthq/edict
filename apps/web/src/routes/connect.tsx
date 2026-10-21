import { type ReactNode, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Agent } from "@edicthq/client";
import { Link } from "react-router";
import { Avatar, Button, SelectMenu, cn } from "@edicthq/ui";
import { Check, ChevronRight, Copy, Minus, Plus } from "lucide-react";
import { AuthShell, FormError, Loading, MarkTile, PageColumn, PageHeader } from "../components/shell.js";
import { connectionLine, firstName } from "../lib/agents.js";
import { useAgents, useApiKeys, useChooseConnectionOrganization, useCreateApiKey, useMembers, useMemberships } from "../lib/queries.js";
import { useOrg } from "./org.js";

type Client = "claude" | "t3" | "codex" | "cursor" | "opencode" | "other";

interface Step {
  title: string;
  body: ReactNode;
  code?: string;
}

// The steps for each MCP client. Every one ends the same way: the client asks
// to sign in, the person approves it, and Edict adds "<Client> (<Name>)".
function clientSteps(client: Client, url: string, first: string): { lead?: ReactNode; steps: Step[] } {
  const approve: Step = {
    title: "Approve it",
    body: (
      <>
        Your browser opens Edict. Pick the organization and approve; Edict adds an agent that acts for {first}.
      </>
    ),
  };
  const use: Step = {
    title: "Use it",
    body: (
      <>
        Ask it to <q className="font-medium text-ink">work on EDI-12</q> or <q className="font-medium text-ink">do my Edict work</q>.
      </>
    ),
  };
  switch (client) {
    case "claude":
      return {
        steps: [
          { title: "Add the server", body: "Run this once. --scope user makes it available in every project.", code: `claude mcp add --transport http --scope user edict ${url}` },
          {
            title: "Sign in",
            body: (
              <>
                Run this, and Claude Code opens the browser. Inside Claude Code, <Code>/mcp</Code> → <Code>edict</Code> → Authenticate does the same.
              </>
            ),
            code: "claude mcp login edict",
          },
          approve,
          use,
        ],
      };
    case "t3":
      return {
        lead: "T3 Code runs Claude Code and Codex, so connect the one your threads use and every thread can reach Edict. For Claude Code:",
        steps: [
          { title: "Add the server", body: "Run this once in a terminal.", code: `claude mcp add --transport http --scope user edict ${url}` },
          { title: "Sign in", body: "Run this in a terminal, and the browser opens. T3 Code threads share that sign-in; new threads get Edict's tools.", code: "claude mcp login edict" },
          approve,
          { title: "Use it", body: <>In any T3 Code thread: <q className="font-medium text-ink">do my Edict work</q>.</> },
        ],
      };
    case "codex":
      return {
        steps: [
          { title: "Add the server", body: <>Add this to <Code>~/.codex/config.toml</Code>.</>, code: `[mcp_servers.edict]\nurl = "${url}"` },
          { title: "Sign in", body: "Run this, and Codex opens the browser.", code: "codex mcp login edict" },
          approve,
          use,
        ],
      };
    case "cursor":
      return {
        steps: [
          {
            title: "Add the server",
            body: <>In Cursor Settings → MCP, add a server, or put this in <Code>~/.cursor/mcp.json</Code>.</>,
            code: JSON.stringify({ mcpServers: { edict: { url } } }, null, 2),
          },
          { title: "Sign in", body: "Cursor shows edict as needing login. Click it." },
          approve,
          use,
        ],
      };
    case "opencode":
      return {
        steps: [
          {
            title: "Add the server",
            body: <>Add this to <Code>opencode.json</Code> in your project, or to the global config.</>,
            code: JSON.stringify({ mcp: { edict: { type: "remote", url } } }, null, 2),
          },
          { title: "Sign in", body: "Run this, and OpenCode opens the browser.", code: "opencode mcp auth edict" },
          approve,
          use,
        ],
      };
    default:
      return {
        lead: "Any client that speaks Streamable HTTP with OAuth works. Most take a server like this in their MCP settings.",
        steps: [
          { title: "Add the server", body: "Point your client at the URL above.", code: JSON.stringify({ mcpServers: { edict: { type: "http", url } } }, null, 2) },
          approve,
          use,
        ],
      };
  }
}

const clients: { value: Client; label: string; initials: string; kind: string }[] = [
  { value: "claude", label: "Claude Code", initials: "CC", kind: "Terminal" },
  { value: "t3", label: "T3 Code", initials: "T3", kind: "Desktop app" },
  { value: "codex", label: "Codex", initials: "CX", kind: "Terminal" },
  { value: "cursor", label: "Cursor", initials: "CU", kind: "Editor" },
  { value: "opencode", label: "OpenCode", initials: "OC", kind: "Terminal" },
  { value: "other", label: "Other", initials: "…", kind: "Any MCP client" },
];

// /:slug/connect: how to connect an MCP client, in the order you do it: the
// URL, your client, its steps, and then the agent it made, which shows up
// here live once you approve it. Runners and powers are quiet notes at the end.
export function ConnectPage() {
  const { orgId, slug, membership } = useOrg();
  const url = `${location.origin}/mcp`;
  const [client, setClient] = useState<Client>("claude");
  const agents = useAgents(orgId);
  const members = useMembers(orgId);
  const mine = (agents.data ?? []).filter((agent) => agent.connectedBy === membership.member.id);
  const first = firstName(membership.member.name);
  const { lead, steps } = clientSteps(client, url, first);
  const chosen = clients.find((c) => c.value === client)!;

  return (
    <>
      <PageHeader title="Connect an agent" />
      <PageColumn className="flex max-w-[760px] flex-col gap-10">
        <section aria-labelledby="mcp-url" className="flex flex-col gap-3">
          <p className="max-w-[60ch] text-body text-ink-2 text-pretty">
            Point your MCP client at this instance and approve it in the browser. Edict adds an agent named after the
            client and you, like <span className="font-medium text-agent-ink">{chosen.value === "other" ? "Claude Code" : chosen.label} ({first})</span>,
            that works on your behalf.
          </p>
          <h2 id="mcp-url" className="sr-only">
            MCP server URL
          </h2>
          <div className="flex h-12 items-center gap-3 rounded-md border border-line bg-surface ps-4 pe-1.5">
            <span className="shrink-0 text-sm font-medium text-ink-2 max-sm:hidden">MCP URL</span>
            <code className="min-w-0 flex-1 truncate font-code text-body text-ink">{url}</code>
            <CopyButton text={url} label="Copy URL" />
          </div>
        </section>

        <section aria-labelledby="your-client" className="flex flex-col gap-3">
          <h2 id="your-client" className="text-sm font-semibold text-ink-2">
            Your client
          </h2>
          <div role="radiogroup" aria-labelledby="your-client" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {clients.map((c) => {
              const active = c.value === client;
              return (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setClient(c.value)}
                  className={cn(
                    "flex min-h-14 items-center gap-3 rounded-md bg-surface px-3 text-start transition-[box-shadow,background-color] duration-(--duration-fast) ease-standard",
                    active
                      ? "shadow-[inset_0_0_0_1.5px_var(--ink)]"
                      : "shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover hover:shadow-[inset_0_0_0_1px_var(--line-strong)]",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-[9px] text-sm font-semibold transition-colors duration-(--duration-fast)",
                      active ? "bg-ink text-on-human" : "bg-hover text-ink-2",
                    )}
                  >
                    {c.initials}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-ui font-medium">{c.label}</span>
                    <span className="block truncate text-sm text-ink-2">{c.kind}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="steps" className="flex flex-col gap-3">
          <h2 id="steps" className="text-sm font-semibold text-ink-2">
            Connect {chosen.value === "other" ? "your client" : chosen.label}
          </h2>
          <div key={client} className="motion-fade rounded-md border border-line bg-surface p-5">
            {lead ? <p className="mb-5 max-w-[64ch] text-ui text-ink-2 text-pretty">{lead}</p> : null}
            <ol className="flex flex-col">
              {steps.map((step, index) => (
                <li key={step.title} className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-4">
                  <span className="flex flex-col items-center">
                    <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-hover text-sm font-semibold tabular-nums">
                      {index + 1}
                    </span>
                    {index < steps.length - 1 ? <span aria-hidden="true" className="my-1 w-px flex-1 bg-line" /> : null}
                  </span>
                  <div className={cn("flex min-w-0 flex-col gap-1.5", index < steps.length - 1 && "pb-6")}>
                    <h3 className="pt-0.5 text-ui font-semibold">{step.title}</h3>
                    <p className="text-ui text-ink-2 text-pretty">{step.body}</p>
                    {step.code ? <CodeBlock text={step.code} /> : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          {client === "claude" || client === "t3" ? (
            <HookSetup orgId={orgId} agent={mine.find((agent) => agent.clientName === "Claude Code")} />
          ) : null}
        </section>

        <section aria-labelledby="your-connections" className="flex flex-col gap-3">
          <h2 id="your-connections" className="flex items-baseline gap-2 text-sm font-semibold text-ink-2">
            Your agents <span className="font-normal tabular-nums">{mine.length}</span>
          </h2>
          {mine.length ? (
            <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface">
              {mine.map((agent) => (
                <li key={agent.id}>
                  <Link
                    to={`/${slug}/agents?agent=${agent.id}`}
                    className="hover-fade flex min-h-14 items-center gap-3 px-4 hover:bg-hover"
                  >
                    <Avatar name={agent.name} kind="agent" size={32} />
                    <span className="min-w-0">
                      <span className="block truncate text-ui font-medium text-agent-ink">{agent.name}</span>
                      <span className="block truncate text-sm text-ink-2">{connectionLine(agent, members.data ?? [])}</span>
                    </span>
                    <ChevronRight aria-hidden="true" className="ms-auto size-4 text-ink-3" strokeWidth={1.75} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-3 rounded-md border border-dashed border-line-strong px-4 py-4">
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-[9px] border border-dashed border-line-strong text-ink-3">
                <Plus className="size-3.5" strokeWidth={2} />
              </span>
              <p className="text-ui text-ink-2 text-pretty">Once you approve a client, its agent shows up here and in the sidebar.</p>
            </div>
          )}
        </section>

        <section aria-label="More ways in" className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 rounded-md bg-hover p-4">
            <h2 className="text-ui font-semibold">No browser on that machine?</h2>
            <p className="text-sm text-ink-2 text-pretty">
              Servers, CI and headless Claude Code run as a runner: an agent with an API key, woken by a webhook the
              moment work is delegated to it.
            </p>
            <Link to={`/${slug}/agents`} className="mt-1 text-sm font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              Set up a runner under Agents
            </Link>
          </div>
          <div className="flex flex-col gap-1.5 rounded-md bg-hover p-4">
            <h2 className="text-ui font-semibold">What an agent can do</h2>
            <p className="text-sm text-ink-2 text-pretty">
              Read and update issues, comment and post progress in the teams you can see. It can't delete, change
              settings, manage members or create agents unless an admin allows it.
            </p>
          </div>
        </section>
      </PageColumn>
    </>
  );
}

// Claude Code's HTTP hooks (ADR 0029): the session's work shows on its issue,
// and the agent spends no tokens saying so. Each hook sends the hook key from
// the shell, never from the settings file.
function hooksConfig(orgId: string): string {
  const hook = {
    type: "http",
    url: `${location.origin}/api/v1/organizations/${orgId}/agent-hooks/claude-code`,
    headers: { Authorization: "Bearer $EDICT_HOOK_KEY" },
    allowedEnvVars: ["EDICT_HOOK_KEY"],
    timeout: 5,
  };
  return JSON.stringify(
    {
      hooks: {
        PostToolUse: [
          { matcher: "mcp__edict__.*", hooks: [hook] },
          { matcher: "Bash", hooks: [{ ...hook, if: "Bash(git commit *)" }, { ...hook, if: "Bash(gh pr create *)" }] },
        ],
        SessionStart: [{ matcher: "resume|compact", hooks: [hook] }],
        Stop: [{ hooks: [hook] }],
      },
    },
    null,
    2,
  );
}

function HookSetup({ orgId, agent }: { orgId: string; agent: Agent | undefined }) {
  return (
    <section aria-labelledby="hooks" className="rounded-md border border-line bg-surface p-5">
      <h3 id="hooks" className="text-ui font-semibold">
        Progress at no token cost
      </h3>
      <p className="mt-1 max-w-[64ch] text-ui text-ink-2 text-pretty">
        Claude Code's hooks tell Edict when it picks up an issue, commits, opens a pull request and finishes a turn. The
        agent never spends tokens on it.
      </p>
      <div className="mt-4 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h4 className="text-ui font-medium">Create a hook key</h4>
          {agent ? (
            <HookKey orgId={orgId} agent={agent} />
          ) : (
            <p className="text-ui text-ink-2 text-pretty">Connect Claude Code first. The key belongs to the agent it adds.</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <h4 className="text-ui font-medium">Add the hooks</h4>
          <p className="text-ui text-ink-2 text-pretty">
            Merge this into <Code>~/.claude/settings.json</Code>, or a project's <Code>.claude/settings.local.json</Code>.
          </p>
          <CodeBlock text={hooksConfig(orgId)} tall />
        </div>
      </div>
    </section>
  );
}

// A hook key can only post hooks, so a leaked settings file or shell profile
// lets someone post progress as the agent and nothing more.
function HookKey({ orgId, agent }: { orgId: string; agent: Agent }) {
  const keys = useApiKeys(orgId, agent.id);
  const create = useCreateApiKey(orgId, agent.id);
  const [secret, setSecret] = useState<string | null>(null);
  const hookKeys = (keys.data ?? []).filter((key) => key.scope === "hooks");
  if (secret) {
    return (
      <>
        <p className="text-ui text-ink-2 text-pretty">
          Add this to your shell profile, like <Code>~/.zshrc</Code>, and start Claude Code again. It is shown only now.
        </p>
        <CodeBlock text={`export EDICT_HOOK_KEY=${secret}`} />
      </>
    );
  }
  return (
    <>
      <p className="text-ui text-ink-2 text-pretty">
        It can post progress for {agent.name} and nothing else.
        {hookKeys.length ? ` You have ${hookKeys.length === 1 ? "one" : hookKeys.length}; a new one works alongside.` : ""}
      </p>
      <FormError message={create.error?.message ?? null} />
      <Button
        variant="secondary"
        className="mt-1 self-start"
        disabled={create.isPending || !!agent.pausedAt}
        onClick={() =>
          create.mutate(
            { name: `Hooks ${hookKeys.length + 1}`, teamIds: null, scope: "hooks" },
            { onSuccess: (created) => setSecret(created.secret) },
          )
        }
      >
        Create hook key
      </Button>
    </>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-xs bg-hover px-1 font-code text-code font-medium text-ink">{children}</code>;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      aria-label={label}
      onClick={() =>
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        })
      }
    >
      {copied ? <Check aria-hidden="true" className="size-3.5" strokeWidth={2} /> : <Copy aria-hidden="true" className="size-3.5" strokeWidth={1.75} />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function CodeBlock({ text, tall = false }: { text: string; tall?: boolean }) {
  return (
    <div className="mt-1 flex items-start gap-2 rounded-sm bg-bg p-1.5 ps-3 shadow-[inset_0_0_0_1px_var(--line)]">
      <pre className={cn("min-w-0 flex-1 overflow-x-auto py-1.5 font-code text-code text-ink", tall && "max-h-64 overflow-y-auto")}>{text}</pre>
      <CopyButton text={text} label="Copy" />
    </div>
  );
}

// Better Auth's OAuth provider sends people here twice (ADR 0021): once to
// choose the organization, then for consent. One click does both.
export function ConsentPage() {
  const query = location.search.slice(1);
  const clientId = new URLSearchParams(query).get("client_id") ?? "";
  const memberships = useMemberships();
  const client = useQuery({
    queryKey: ["oauth-client", clientId],
    queryFn: async () => {
      const res = await fetch(`/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`, { credentials: "include" });
      return res.ok ? ((await res.json()) as { client_name?: string; name?: string }) : null;
    },
    enabled: !!clientId,
  });
  const choose = useChooseConnectionOrganization();
  const [orgId, setOrgId] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!orgId && memberships.data?.[0]) setOrgId(memberships.data[0].organization.id);
  }, [memberships.data, orgId]);

  if (memberships.isPending || client.isPending) return <Loading />;
  // As the server names agents: without the "(<server name>)" Claude Code adds.
  const name = (client.data?.client_name ?? client.data?.name ?? "").replace(/\s*\([^()]*\)\s*$/, "").trim() || "An MCP client";
  const me = memberships.data?.find((m) => m.organization.id === orgId)?.member;

  const post = async (path: string, body: unknown) => {
    const res = await fetch(`/api/auth${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; redirect_uri?: string; error_description?: string; message?: string };
    if (!res.ok) throw new Error(data.error_description ?? data.message ?? "Connecting failed. Try again from your MCP client.");
    return new URL(data.url ?? data.redirect_uri ?? "/", location.origin);
  };

  const allow = async () => {
    setFailure(null);
    setBusy(true);
    try {
      await choose.mutateAsync(orgId);
      let next = await post("/oauth2/continue", { postLogin: true, oauth_query: query });
      // Back at this page for consent: accept with the query it carries now.
      if (next.origin === location.origin && next.pathname === "/oauth/consent") {
        next = await post("/oauth2/consent", { accept: true, oauth_query: next.search.slice(1) });
      }
      location.href = next.toString();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  };
  const deny = async () => {
    setBusy(true);
    try {
      location.href = (await post("/oauth2/consent", { accept: false, oauth_query: query })).toString();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  };

  if (!memberships.data?.length) {
    return (
      <AuthShell title={`Connect ${name}`} lead="You need to belong to an organization first.">
        <Link to="/new" className="text-ui font-medium underline decoration-line-strong underline-offset-4">
          Create an organization
        </Link>
      </AuthShell>
    );
  }
  const agentName = `${name}${me ? ` (${me.name.split(/\s+/)[0]})` : ""}`;
  return (
    <AuthShell
      title={`Connect ${name} to Edict`}
      lead={
        <>
          It joins as the agent <span className="font-medium text-agent-ink">{agentName}</span> and acts on your behalf.
        </>
      }
      mark={
        <div aria-hidden="true" className="mx-auto flex items-center gap-3">
          <Avatar name={agentName} kind="agent" size={32} />
          <span className="w-10 border-t border-dashed border-line-strong" />
          <MarkTile />
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface text-ui">
          <div className="flex min-h-12 items-center gap-3 px-4 py-2.5">
            <span className="text-ink-2">Organization</span>
            {memberships.data.length > 1 ? (
              <SelectMenu
                label="Organization"
                value={orgId}
                onChange={setOrgId}
                options={memberships.data.map((m) => ({ value: m.organization.id, label: m.organization.name }))}
                align="end"
                className="ms-auto max-w-[60%]"
              />
            ) : (
              <span className="ms-auto font-medium">{memberships.data[0]!.organization.name}</span>
            )}
          </div>
          <ul aria-label="What it can do" className="flex flex-col gap-2.5 px-4 py-3.5">
            <Can>Reads and updates issues, comments and posts progress, in the teams you can see</Can>
            <Can>Shows as {agentName}, so everyone can tell its work from yours</Can>
            <Can no>Deletes nothing and changes no settings or members, unless an admin allows it</Can>
          </ul>
        </div>
        <FormError message={failure} />
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" disabled={busy} onClick={() => void deny()}>
            Deny
          </Button>
          <Button variant="primary" size="lg" disabled={busy || !orgId} onClick={() => void allow()}>
            Allow
          </Button>
        </div>
        <p className="text-center text-sm text-ink-2 text-pretty">
          {me?.email ? <>Signed in as {me.email}. </> : null}Pause it any time under Agents.
        </p>
      </div>
    </AuthShell>
  );
}

// One line of what a connected agent may do, or may not.
function Can({ no = false, children }: { no?: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-ink-2">
      <span className={cn("mt-px grid size-4 shrink-0 place-items-center rounded-full", no ? "bg-hover text-ink-2" : "bg-ink text-on-human")}>
        {no ? <Minus aria-hidden="true" className="size-2.5" strokeWidth={2.5} /> : <Check aria-hidden="true" className="size-2.5" strokeWidth={3} />}
      </span>
      <span className="text-pretty">{children}</span>
    </li>
  );
}
