import { type ReactNode, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Avatar, Button, SelectMenu, Tabs } from "@edicthq/ui";
import { Check, Copy } from "lucide-react";
import { AuthShell, FormError, Loading, PageColumn, PageHeader } from "../components/shell.js";
import { connectionLine, firstName } from "../lib/agents.js";
import { useAgents, useChooseConnectionOrganization, useMembers, useMemberships } from "../lib/queries.js";
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
          { title: "Sign in", body: <>Start <Code>claude</Code>, type <Code>/mcp</Code>, pick <Code>edict</Code> and choose Authenticate.</> },
          approve,
          use,
        ],
      };
    case "t3":
      return {
        lead: "T3 Code runs Claude Code and Codex, so connect the one your threads use and every thread can reach Edict. For Claude Code:",
        steps: [
          { title: "Add the server", body: "Run this once in a terminal.", code: `claude mcp add --transport http --scope user edict ${url}` },
          { title: "Sign in", body: <>Run <Code>claude</Code> once, type <Code>/mcp</Code>, pick <Code>edict</Code> and authenticate. T3 Code threads share that sign-in.</> },
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

const clients: { value: Client; label: string }[] = [
  { value: "claude", label: "Claude Code" },
  { value: "t3", label: "T3 Code" },
  { value: "codex", label: "Codex" },
  { value: "cursor", label: "Cursor" },
  { value: "opencode", label: "OpenCode" },
  { value: "other", label: "Other" },
];

// /:slug/connect: how to connect an MCP client, or an agent runner.
export function ConnectPage() {
  const { orgId, slug, membership } = useOrg();
  const url = `${location.origin}/mcp`;
  const [client, setClient] = useState<Client>("claude");
  const agents = useAgents(orgId);
  const members = useMembers(orgId);
  const mine = (agents.data ?? []).filter((agent) => agent.connectedBy === membership.member.id);
  const first = firstName(membership.member.name);
  const { lead, steps } = clientSteps(client, url, first);

  return (
    <>
      <PageHeader title="Connect an agent" />
      <PageColumn className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col gap-8">
          <p className="max-w-[64ch] text-body text-ink-2 text-pretty">
            Every Edict has an MCP server at one URL. Add it to your client, approve it, and Edict adds an agent named
            after the client and you, which acts on your behalf.
          </p>

          <section aria-labelledby="mcp-url" className="flex flex-col gap-2">
            <h2 id="mcp-url" className="text-sm font-semibold text-ink-2">
              MCP server URL
            </h2>
            <div className="flex items-center gap-2 rounded-md border border-line bg-surface p-1.5 ps-3">
              <code className="min-w-0 flex-1 truncate font-code text-body">{url}</code>
              <CopyButton text={url} label="Copy URL" />
            </div>
          </section>

          <section aria-labelledby="your-client" className="flex flex-col gap-4">
            <h2 id="your-client" className="text-sm font-semibold text-ink-2">
              Your client
            </h2>
            {/* Six tabs don't fit a phone: there it is a menu. */}
            <Tabs label="MCP client" value={client} onChange={setClient} items={clients} className="max-sm:hidden" />
            <SelectMenu label="MCP client" value={client} onChange={setClient} options={clients} className="self-start sm:hidden" />
            {lead ? <p className="max-w-[64ch] text-ui text-ink-2 text-pretty">{lead}</p> : null}
            <ol className="flex flex-col">
              {steps.map((step, index) => (
                <li key={step.title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3">
                  <span className="flex flex-col items-center">
                    <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-hover text-sm font-semibold tabular-nums">
                      {index + 1}
                    </span>
                    {index < steps.length - 1 ? <span aria-hidden="true" className="w-px flex-1 bg-line" /> : null}
                  </span>
                  <div className="flex min-w-0 flex-col gap-2 pb-6">
                    <h3 className="pt-0.5 text-ui font-semibold">{step.title}</h3>
                    <p className="text-ui text-ink-2 text-pretty">{step.body}</p>
                    {step.code ? <CodeBlock text={step.code} /> : null}
                  </div>
                </li>
              ))}
            </ol>
            <div className="rounded-md bg-hover p-4">
              <h3 className="text-ui font-semibold">No browser on that machine?</h3>
              <p className="mt-1 text-ui text-ink-2 text-pretty">
                An admin can create a runner agent under{" "}
                <Link to={`/${slug}/agents`} className="underline decoration-line-strong underline-offset-2 hover:text-ink">
                  Agents
                </Link>{" "}
                and give it an API key. The client then sends it with every request instead of signing in:
              </p>
              <div className="mt-3">
                <CodeBlock text={`--header "Authorization: Bearer edict_ak_…"`} />
              </div>
            </div>
          </section>

          <section aria-labelledby="your-connections" className="flex flex-col gap-2">
            <h2 id="your-connections" className="text-sm font-semibold text-ink-2">
              Your connections
            </h2>
            {mine.length ? (
              <ul className="flex flex-col gap-px rounded-md border border-line bg-surface p-1">
                {mine.map((agent) => (
                  <li key={agent.id}>
                    <Link to={`/${slug}/agents?agent=${agent.id}`} className="flex min-h-11 items-center gap-3 rounded-sm px-2.5 hover:bg-hover">
                      <Avatar name={agent.name} kind="agent" />
                      <span className="min-w-0">
                        <span className="block truncate text-ui font-medium text-agent-ink">{agent.name}</span>
                        <span className="block truncate text-sm text-ink-2">{connectionLine(agent, members.data ?? [])}</span>
                      </span>
                      <span className="ms-auto text-sm text-ink-2">Open</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed border-line-strong px-4 py-3 text-ui text-ink-2">
                No client connected yet. Once you approve one, it shows up here.
              </p>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:pt-1">
          <div className="rounded-md border border-line bg-surface p-4">
            <h2 className="text-ui font-semibold">Agent runners</h2>
            <p className="mt-1 text-sm text-ink-2 text-pretty">
              A server running Claude Code headless, the Agent SDK or CI uses an API key, and a webhook wakes it the
              moment an issue is delegated to it.
            </p>
            <Link to={`/${slug}/agents`} className="mt-3 inline-block text-sm font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              Manage agents
            </Link>
          </div>
          <div className="rounded-md border border-line bg-surface p-4">
            <h2 className="text-ui font-semibold">What an agent can do</h2>
            <p className="mt-1 text-sm text-ink-2 text-pretty">
              Read and update issues, comment and post progress in your teams. It can't delete, change settings, manage
              members or create agents unless an admin grants it.
            </p>
          </div>
        </aside>
      </PageColumn>
    </>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-xs bg-hover px-1 font-code text-[0.88em] font-medium text-ink">{children}</code>;
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

function CodeBlock({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-line bg-surface p-1.5 ps-3">
      <pre className="min-w-0 flex-1 overflow-x-auto py-1.5 font-code text-code text-ink">{text}</pre>
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
  const name = client.data?.client_name ?? client.data?.name ?? "An MCP client";
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
  return (
    <AuthShell
      title={`Connect ${name} to Edict`}
      lead={`Edict adds ${name}${me ? ` (${me.name.split(/\s+/)[0]})` : ""} as an agent in the organization you choose. It acts on your behalf, sees the teams you see, and can't delete anything or change settings. Pause it any time under Agents.`}
    >
      <div className="flex flex-col gap-4">
        {memberships.data.length > 1 ? (
          <div className="flex flex-col gap-1.5 text-ui font-medium">
            Organization
            <SelectMenu
              label="Organization"
              value={orgId}
              onChange={setOrgId}
              options={memberships.data.map((m) => ({ value: m.organization.id, label: m.organization.name }))}
              className="h-9 w-full"
            />
          </div>
        ) : (
          <p className="text-ui">
            Organization: <span className="font-medium">{memberships.data[0]!.organization.name}</span>
          </p>
        )}
        <FormError message={failure} />
        <div className="flex gap-2">
          <Button variant="primary" disabled={busy || !orgId} onClick={() => void allow()}>
            Allow
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void deny()}>
            Deny
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}
