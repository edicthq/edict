import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Button, Select } from "@edicthq/ui";
import { AuthShell, FormError, GroupHeader, Loading, PageBody, PageHeader } from "../components/shell.js";
import { useChooseConnectionOrganization, useMemberships } from "../lib/queries.js";

// /:slug/connect: how to connect an MCP client, or an agent runner.
export function ConnectPage() {
  const url = `${location.origin}/mcp`;
  return (
    <>
      <PageHeader title="Connect your agent" />
      <PageBody className="flex max-w-[760px] flex-col gap-6">
        <p className="max-w-[64ch] px-3 text-ui text-ink-2 text-pretty">
          Every Edict has an MCP server at one URL. Add it to your MCP client, sign in when it asks, and approve it. Edict
          adds an agent for that client, named after it and you, which acts on your behalf. Then tell it{" "}
          <q className="font-medium text-ink">work on ENG-142</q>, or <q className="font-medium text-ink">do my Edict work</q>.
        </p>
        <Snippet title="MCP server URL" text={url} />
        <Snippet title="Claude Code" text={`claude mcp add --transport http edict ${url}`} hint="Then run /mcp in Claude Code and pick edict to sign in." />
        <Snippet
          title="Other clients (Cursor, Claude Desktop, Codex and more)"
          text={JSON.stringify({ mcpServers: { edict: { type: "http", url } } }, null, 2)}
          hint="Most clients take a server like this in their MCP settings. Any client that speaks Streamable HTTP with OAuth works."
        />
        <section className="flex flex-col gap-2">
          <GroupHeader>Agent runners</GroupHeader>
          <p className="max-w-[64ch] px-3 text-ui text-ink-2 text-pretty">
            A server running Claude Code headless, the Agent SDK or CI uses an API key instead of signing in. An admin
            creates its agent under <Link to="../agents" relative="path" className="underline decoration-line-strong underline-offset-2">Agents</Link>,
            gives it a key, and adds a webhook so it starts as soon as work is delegated to it. It sends the key as{" "}
            <code className="font-code text-code">Authorization: Bearer</code> to the same URL.
          </p>
        </section>
      </PageBody>
    </>
  );
}

function Snippet({ title, text, hint }: { title: string; text: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="flex flex-col gap-2 px-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink-2">{title}</h2>
        <Button
          variant="ghost"
          className="ms-auto"
          onClick={() => void navigator.clipboard?.writeText(text).then(() => setCopied(true))}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-sm bg-surface p-3 font-code text-code shadow-[inset_0_0_0_1px_var(--line)]">{text}</pre>
      {hint ? <p className="text-sm text-ink-2">{hint}</p> : null}
    </section>
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
          <label className="flex flex-col gap-1.5 text-ui font-medium">
            Organization
            <Select value={orgId} onChange={(event) => setOrgId(event.target.value)}>
              {memberships.data.map((m) => (
                <option key={m.organization.id} value={m.organization.id}>
                  {m.organization.name}
                </option>
              ))}
            </Select>
          </label>
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
