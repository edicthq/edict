import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test } from "./fixtures.js";

// The M3 exit criterion (docs/PLAN.md): an MCP client connects by URL and
// works an issue from start to finish. The test plays the client the way
// Claude Code does — discovery, registration, the consent page in the
// browser, PKCE — then works the issue through the MCP tools while the person
// watches it in the web app.
test("an MCP client connects by URL and works a delegated issue", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Maya Chen", email: "maya3@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok()).toBe(true);
  const org = await (await page.request.post("/api/v1/organizations", { headers, data: { name: "Agents", slug: "agents-co" } })).json();
  const orgId = org.organization.id as string;
  const me = org.member.id as string;
  const team = (await (
    await page.request.post(`/api/v1/organizations/${orgId}/teams`, { headers, data: { name: "Engineering", key: "ENG" } })
  ).json()) as { id: string };
  await page.request.post(`/api/v1/organizations/${orgId}/teams/${team.id}/issues`, {
    headers,
    data: { title: "Fix the login redirect", description: "Users bounce back after OAuth.", assigneeId: me },
  });
  const api = async (path: string) => (await page.request.get(`/api/v1/organizations/${orgId}${path}`)).json();

  // The client gets 401 from the one URL, and finds the OAuth server from it.
  const mcpUrl = `${baseURL}/mcp`;
  const challenge = await fetch(mcpUrl, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(challenge.status).toBe(401);
  const metadataUrl = /resource_metadata="([^"]+)"/.exec(challenge.headers.get("www-authenticate") ?? "")![1]!;
  const resource = (await (await fetch(metadataUrl)).json()) as any;
  const issuer = new URL(resource.authorization_servers[0]);
  const server = (await (await fetch(`${issuer.origin}/.well-known/oauth-authorization-server${issuer.pathname}`)).json()) as any;
  const redirect = "http://127.0.0.1:47123/callback";
  const registered: any = await (
    await fetch(server.registration_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Claude Code", redirect_uris: [redirect], token_endpoint_auth_method: "none" }),
    })
  ).json();

  // The person approves it on the consent page.
  const verifier = randomBytes(32).toString("base64url");
  const authorize = new URL(server.authorization_endpoint);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: registered.client_id,
    redirect_uri: redirect,
    scope: "openid offline_access",
    state: "s1",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    resource: resource.resource,
  }).toString();
  let code = "";
  await page.route(`${redirect}**`, async (route) => {
    code = new URL(route.request().url()).searchParams.get("code") ?? "";
    await route.fulfill({ body: "You can close this tab." });
  });
  await page.goto(authorize.toString());
  await expect(page.getByRole("heading", { name: "Connect Claude Code to Edict" })).toBeVisible();
  await page.getByRole("button", { name: "Allow" }).click();
  await expect.poll(() => code).not.toBe("");
  const tokens: any = await (
    await fetch(server.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirect,
        client_id: registered.client_id,
        code_verifier: verifier,
        resource: resource.resource,
      }),
    })
  ).json();

  const client = new Client({ name: "claude-code", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(mcpUrl), { requestInit: { headers: { authorization: `Bearer ${tokens.access_token}` } } }),
  );
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    expect(result.isError ?? false, result.content[0]?.text).toBe(false);
    return result.content.map((part) => part.text).join("\n");
  };
  expect(await call("list_teams")).toContain("ENG Engineering");

  // The person delegates the issue to their agent from the peek.
  await page.goto(`/agents-co/teams/${team.id}?issue=ENG-1`);
  const peek = page.getByRole("complementary", { name: /ENG-1/ });
  await expect(peek).toBeVisible();
  await expect(peek.getByText("No agent on this issue yet.")).toBeVisible();
  await page.keyboard.press("d");
  await expect(page.getByRole("option", { name: /Claude Code \(Maya\).*connected by Maya · picks up work when asked/ })).toBeVisible();
  await page.getByRole("combobox", { name: "Delegate to an agent" }).fill("claude");
  await page.keyboard.press("Enter");
  await expect(peek.getByRole("button", { name: /Delegate: Claude Code \(Maya\)/ })).toBeVisible();
  await expect(peek.getByText("Waiting for Claude Code to pick it up")).toBeVisible();

  // "Do my Edict work": the agent finds it and works it.
  expect(await call("my_work")).toContain("ENG-1 Fix the login redirect");
  const read = await call("get_issue", { issue: "ENG-1" });
  const version = Number(/Version: (\d+)/.exec(read)![1]);
  await call("update_issue", { issue: "ENG-1", version, status: "In Progress" });
  await call("post_progress", { issue: "ENG-1", state: "working", message: "Tracing the `next` parameter through sign-in." });

  // The person sees it working, live.
  await expect(peek.getByRole("button", { name: /Status: In Progress/ })).toBeVisible({ timeout: 15_000 });
  await expect(peek.getByText("Tracing the")).toBeVisible({ timeout: 15_000 });
  await expect(peek.getByText("Claude Code (Maya) is working")).toBeVisible();

  await call("link", { issue: "ENG-1", url: "https://github.com/edicthq/edict/pull/42", title: "Keep next through sign-in" });
  await call("comment", { issue: "ENG-1", body: "The redirect dropped `next`; fixed in the linked pull request." });
  await call("update_issue", { issue: "ENG-1", version: version + 1, status: "done" });
  await call("post_progress", {
    issue: "ENG-1",
    state: "done",
    message: "Merged.",
    links: [{ url: "https://github.com/edicthq/edict/pull/42", title: "#42 Keep next through sign-in" }],
  });
  await client.close();

  // The API agrees, and every step reads as the agent on behalf of Maya.
  const done = await api("/issues/ENG-1");
  const statuses = (await api(`/teams/${team.id}/statuses`)) as { id: string; category: string }[];
  expect(statuses.find((s) => s.id === done.statusId)?.category).toBe("done");
  expect(done.latestProgress).toMatchObject({ state: "done" });
  const agentId = done.delegateId as string;
  const events = (await api("/events?limit=200")) as { actorId: string; onBehalfOfId: string | null; type: string }[];
  const agentEvents = events.filter((e) => e.actorId === agentId);
  expect(agentEvents.map((e) => e.type)).toEqual(
    expect.arrayContaining(["agent.connected", "issue.updated", "progress.posted", "link.created", "comment.created"]),
  );
  expect(agentEvents.every((e) => e.onBehalfOfId === me)).toBe(true);

  // And so does the web app.
  await page.reload();
  await expect(peek.getByRole("button", { name: /Status: Done/ })).toBeVisible();
  await expect(peek.getByRole("link", { name: "Keep next through sign-in", exact: true })).toBeVisible();
  await expect(peek.getByRole("link", { name: "#42 Keep next through sign-in" })).toBeVisible();
  if (process.env.E2E_SCREENSHOTS) await page.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/m3-peek-${test.info().project.name}.png` });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /ENG-1 Fix the login redirect.*Merged\./ })).toBeVisible();
  if (process.env.E2E_SCREENSHOTS) await page.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/m3-list-${test.info().project.name}.png` });
});

test("an admin adds a runner agent with an API key and a webhook, then pauses it", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Theo Lindqvist", email: "theo3@example.com", password: "correct-horse-battery" },
  });
  const org = await (await page.request.post("/api/v1/organizations", { headers, data: { name: "Runners", slug: "runners" } })).json();
  const orgId = org.organization.id as string;

  await page.goto("/runners/agents");
  await page.getByRole("button", { name: "New agent" }).click();
  const dialog = page.getByRole("dialog", { name: "New agent" });
  await dialog.getByLabel("Name").fill("Ferro");
  await dialog.getByLabel("What it does").fill("Fixes failing CI runs");
  await dialog.getByRole("button", { name: "Create agent" }).click();
  await expect(dialog).toBeHidden();
  const card = page.locator("li", { has: page.getByRole("heading", { name: "Ferro" }) });
  await expect(card.getByText("runner · picks up work when it next runs")).toBeVisible();

  await card.getByRole("button", { name: "New API key" }).click();
  const secret = page.getByRole("dialog", { name: "Copy the API key" });
  const key = (await secret.getByLabel("Secret").textContent())!;
  expect(key).toMatch(/^edict_ak_/);
  await secret.getByRole("button", { name: "Done" }).click();
  const teams = await page.request.get(`/api/v1/organizations/${orgId}/teams`, { headers: { authorization: `Bearer ${key}` } });
  expect(teams.status()).toBe(200);

  await card.getByLabel("URL").fill("https://runner.example.com/edict");
  await card.getByRole("button", { name: "Add webhook" }).click();
  await page.getByRole("dialog", { name: "Copy the signing secret" }).getByRole("button", { name: "Done" }).click();
  await expect(card.getByText("runner · starts right away")).toBeVisible();
  await card.getByLabel("Delete").check();
  await expect(card.getByText("can delete")).toBeVisible();
  if (process.env.E2E_SCREENSHOTS) await page.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/m3-agents-${test.info().project.name}.png`, fullPage: true });

  await card.getByRole("button", { name: "Pause" }).click();
  await expect(card.getByText("Paused", { exact: true })).toBeVisible();
  const after = await page.request.get(`/api/v1/organizations/${orgId}/teams`, { headers: { authorization: `Bearer ${key}` } });
  expect(after.status()).toBe(401);
});
