// Contract tests for /mcp (ADR 0011): the real tools, through the MCP SDK's
// own client over Streamable HTTP, against a seeded instance. Agents depend
// on these tool names, inputs and messages.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it } from "vitest";
import { runner } from "./agent-client.js";
import { connect } from "./oauth-client.js";
import { createTeam, join, orgWithOwner } from "./org.js";
import { startTestServer } from "./server.js";

async function mcpClient(baseUrl: string, token: string) {
  const client = new Client({ name: "edict-contract-test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );
  return {
    client,
    // The text of a tool's answer, and whether it is an error.
    call: async (name: string, args: Record<string, unknown> = {}) => {
      const result = (await client.callTool({ name, arguments: args })) as {
        isError?: boolean;
        content: { type: string; text: string }[];
      };
      return { error: result.isError === true, text: result.content.map((part) => part.text).join("\n") };
    },
  };
}

async function seed() {
  const t = await startTestServer();
  const { owner, org, orgId, ownerId } = await orgWithOwner(t.baseUrl, "Amirali");
  const eng = await createTeam(owner, org, "ENG");
  await owner.post(`${org}/labels`, { name: "bug" });
  const issue = (
    await owner.post(`${org}/teams/${eng.id}/issues`, {
      title: "Fix the login redirect",
      description: "Users bounce back after OAuth.",
      assigneeId: ownerId,
    })
  ).body as { id: string; identifier: string; version: number };
  return { t, owner, org, orgId, ownerId, eng, issue };
}

describe("/mcp", () => {
  it("answers 401 without a token, pointing at the OAuth metadata", async () => {
    const t = await startTestServer();
    const res = await fetch(`${t.baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(
      `resource_metadata="${t.baseUrl}/.well-known/oauth-protected-resource/mcp"`,
    );
  });

  it("offers the task-shaped tools, the issue resource and the prompts", async () => {
    const { t, owner, orgId } = await seed();
    const { client } = await mcpClient(t.baseUrl, (await connect(t.baseUrl, owner, orgId)).accessToken);
    const tools = (await client.listTools()).tools.map((tool) => tool.name).sort();
    expect(tools).toEqual([
      "comment",
      "create_issue",
      "get_issue",
      "get_team_context",
      "link",
      "list_teams",
      "my_work",
      "post_progress",
      "relate_issues",
      "search_issues",
      "update_issue",
    ]);
    const templates = (await client.listResourceTemplates()).resourceTemplates.map((r) => r.uriTemplate);
    expect(templates).toEqual(["edict://issue/{identifier}"]);
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name).sort();
    expect(prompts).toEqual(["plan_issues", "work_my_queue"]);
  });

  it("works a delegated issue from start to finish as a connected agent", async () => {
    const { t, owner, org, orgId, ownerId, eng, issue } = await seed();
    const { accessToken } = await connect(t.baseUrl, owner, orgId);
    const { call } = await mcpClient(t.baseUrl, accessToken);

    // Connecting created the agent; the human delegates to it.
    const agent = (await owner.get(`${org}/agents`)).body[0] as { id: string; name: string };
    expect(agent.name).toBe("Claude Code (Amirali)");
    await owner.patch(`${org}/issues/${issue.identifier}`, { version: issue.version, delegateId: agent.id });

    const queue = await call("my_work");
    expect(queue.error).toBe(false);
    expect(queue.text).toContain(`${issue.identifier} Fix the login redirect`);

    const read = await call("get_issue", { issue: issue.identifier });
    expect(read.text).toContain("Users bounce back after OAuth.");
    expect(read.text).toContain("Version: 2");
    expect(read.text).toContain("Delegate: Claude Code (Amirali)");

    const started = await call("update_issue", { issue: issue.identifier, version: 2, status: "In Progress" });
    expect(started.error, started.text).toBe(false);
    expect(started.text).toContain("In Progress");

    expect((await call("post_progress", { issue: issue.identifier, state: "working", message: "Tracing the redirect." })).error).toBe(false);
    expect((await call("link", { issue: issue.identifier, url: "https://github.com/edicthq/edict/pull/7", title: "Fix redirect" })).error).toBe(false);
    expect((await call("comment", { issue: issue.identifier, body: "Root cause: the `next` param was dropped." })).error).toBe(false);
    // A status category works as well as a status name.
    const finished = await call("update_issue", { issue: issue.identifier, version: 3, status: "done" });
    expect(finished.error, finished.text).toBe(false);
    expect((await call("post_progress", { issue: issue.identifier, state: "done", message: "Merged." })).error).toBe(false);

    const after = (await owner.get(`${org}/issues/${issue.identifier}`)).body;
    const statuses = (await owner.get(`${org}/teams/${eng.id}/statuses`)).body as { id: string; category: string }[];
    expect(statuses.find((s) => s.id === after.statusId)?.category).toBe("done");
    expect(after.latestProgress).toMatchObject({ state: "done", agentId: agent.id });
    expect((await owner.get(`${org}/issues/${issue.identifier}/links`)).body).toHaveLength(1);
    expect((await owner.get(`${org}/issues/${issue.identifier}/comments`)).body[0].creatorId).toBe(agent.id);

    const events = (await owner.get(`${org}/events`)).body as { type: string; actorId: string; onBehalfOfId: string | null }[];
    const byAgent = events.filter((e) => e.actorId === agent.id && e.type !== "agent.connected");
    expect(byAgent.length).toBeGreaterThanOrEqual(6);
    expect(byAgent.every((e) => e.onBehalfOfId === ownerId)).toBe(true);
    expect((await call("my_work")).text).not.toContain(issue.identifier);
  });

  it("takes human values and lists the valid ones when one is wrong", async () => {
    const { t, owner, org, issue } = await seed();
    const ferro = await runner(t.baseUrl, owner, org, [(await owner.get(`${org}/teams`)).body[0].id]);
    const { call } = await mcpClient(t.baseUrl, ferro.secret);

    const created = await call("create_issue", {
      team: "eng",
      title: "Add a CSV export",
      status: "todo",
      priority: "high",
      assignee: "@amirali",
      delegate: "me",
      labels: ["Bug"],
    });
    expect(created.error, created.text).toBe(false);
    expect(created.text).toContain("ENG-2");
    const made = (await owner.get(`${org}/issues/ENG-2`)).body;
    expect(made).toMatchObject({ priority: "high", delegateId: ferro.id });
    expect(made.labelIds).toHaveLength(1);

    const badStatus = await call("update_issue", { issue: issue.identifier, version: 1, status: "Shipping" });
    expect(badStatus.error).toBe(true);
    expect(badStatus.text).toContain("Shipping");
    expect(badStatus.text).toContain("In Progress");

    const badPerson = await call("update_issue", { issue: issue.identifier, version: 1, assignee: "@nobody" });
    expect(badPerson.error).toBe(true);
    expect(badPerson.text).toContain("@amirali");

    const badTeam = await call("create_issue", { team: "XYZ", title: "Nope" });
    expect(badTeam.error).toBe(true);
    expect(badTeam.text).toContain("ENG");
  });

  it("tells an agent to re-read when its version is stale", async () => {
    const { t, owner, org, orgId, issue } = await seed();
    const { call } = await mcpClient(t.baseUrl, (await connect(t.baseUrl, owner, orgId)).accessToken);
    await owner.patch(`${org}/issues/${issue.identifier}`, { version: 1, title: "Renamed by a person" });
    const stale = await call("update_issue", { issue: issue.identifier, version: 1, title: "Renamed by the agent" });
    expect(stale.error).toBe(true);
    expect(stale.text).toMatch(/get_issue/);
  });

  it("searches, relates issues, and gives a team's context", async () => {
    const { t, owner, org, orgId, eng, issue } = await seed();
    const other = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Refresh tokens expire early" })).body;
    await join(t.baseUrl, owner, org, "Mina", "member", [eng.id]);
    const { call, client } = await mcpClient(t.baseUrl, (await connect(t.baseUrl, owner, orgId)).accessToken);

    expect((await call("search_issues", { query: "login" })).text).toContain(issue.identifier);
    expect((await call("list_teams")).text).toContain("ENG");

    const context = await call("get_team_context", { team: "ENG" });
    expect(context.text).toContain("In Progress (in_progress)");
    expect(context.text).toContain("bug");
    expect(context.text).toContain("@mina");

    const related = await call("relate_issues", { issue: issue.identifier, relation: "blocks", other: other.identifier });
    expect(related.error, related.text).toBe(false);
    const relations = (await owner.get(`${org}/issues/${issue.identifier}/relations`)).body;
    expect(relations).toEqual([expect.objectContaining({ type: "blocks" })]);

    const resource = await client.readResource({ uri: `edict://issue/${issue.identifier}` });
    expect((resource.contents[0] as { text: string }).text).toContain("Fix the login redirect");
  });
});
