import { describe, expect, it } from "vitest";
import { createTeam, join, orgWithOwner } from "./org.js";
import { connect } from "./oauth-client.js";
import { signUpAs, startTestServer } from "./server.js";

function bearer(baseUrl: string, token: string) {
  const call = async (method: string, path: string, body?: unknown) => {
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${baseUrl}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  };
  return {
    get: (path: string) => call("GET", path),
    post: (path: string, body?: unknown) => call("POST", path, body ?? {}),
  };
}

describe("connecting an MCP client", () => {
  it("creates a connected agent that acts on behalf of its human", async () => {
    const t = await startTestServer();
    const { owner, org, orgId, ownerId } = await orgWithOwner(t.baseUrl, "Amirali");
    const eng = await createTeam(owner, org, "ENG");

    const { accessToken } = await connect(t.baseUrl, owner, orgId);
    expect(accessToken).toMatch(/^edict_at_/);
    const claude = bearer(t.baseUrl, accessToken);

    const memberships = await claude.get("/organizations");
    expect(memberships.status).toBe(200);
    const agent = memberships.body[0].member;
    expect(agent).toMatchObject({ kind: "agent", name: "Claude Code (Amirali)", role: "member" });

    const agents = await owner.get(`${org}/agents`);
    expect(agents.body).toEqual([
      expect.objectContaining({ id: agent.id, connectedBy: ownerId, clientName: "Claude Code", pausedAt: null }),
    ]);

    const issue = await claude.post(`${org}/teams/${eng.id}/issues`, { title: "Work on this" });
    expect(issue.status).toBe(201);
    const events = (await owner.get(`${org}/events`)).body as { type: string; actorId: string; onBehalfOfId: string | null }[];
    expect(events.find((e) => e.type === "issue.created")).toMatchObject({ actorId: agent.id, onBehalfOfId: ownerId });
    expect(events.find((e) => e.type === "agent.connected")).toMatchObject({ actorId: agent.id, onBehalfOfId: ownerId });
  });

  it("reuses the agent when the same person reconnects the same client", async () => {
    const t = await startTestServer();
    const { owner, org, orgId } = await orgWithOwner(t.baseUrl, "Amirali");

    const first = bearer(t.baseUrl, (await connect(t.baseUrl, owner, orgId)).accessToken);
    const second = bearer(t.baseUrl, (await connect(t.baseUrl, owner, orgId)).accessToken);
    const codex = bearer(t.baseUrl, (await connect(t.baseUrl, owner, orgId, "Codex")).accessToken);

    const a = (await first.get("/organizations")).body[0].member.id;
    expect((await second.get("/organizations")).body[0].member.id).toBe(a);
    expect((await codex.get("/organizations")).body[0].member.id).not.toBe(a);
    expect((await owner.get(`${org}/agents`)).body.map((x: { name: string }) => x.name)).toEqual([
      "Claude Code (Amirali)",
      "Codex (Amirali)",
    ]);
  });

  it("needs an organization chosen on the consent page", async () => {
    const t = await startTestServer();
    const { owner } = await orgWithOwner(t.baseUrl);
    await expect(connect(t.baseUrl, owner, null)).rejects.toMatchObject({ status: 400 });
  });

  it("refuses an organization the person does not belong to", async () => {
    const t = await startTestServer();
    const { orgId } = await orgWithOwner(t.baseUrl);
    const stranger = await signUpAs(t.baseUrl, "Stranger");
    expect((await stranger.post("/oauth/organization", { orgId })).status).toBe(404);
  });

  it("gives a guest's agent only the guest's teams, and no more than a Member's role", async () => {
    const t = await startTestServer();
    const { owner, org, orgId } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await createTeam(owner, org, "OPS");
    const { client: guest } = await join(t.baseUrl, owner, org, "Gina", "guest", [eng.id]);

    const agent = bearer(t.baseUrl, (await connect(t.baseUrl, guest, orgId)).accessToken);
    expect((await agent.get(`${org}/teams`)).body.map((x: { key: string }) => x.key)).toEqual(["ENG"]);
    expect((await agent.get("/organizations")).body[0].member.role).toBe("guest");

    // The Owner's agent sees every team but still cannot change settings.
    const ownerAgent = bearer(t.baseUrl, (await connect(t.baseUrl, owner, orgId)).accessToken);
    expect((await ownerAgent.get(`${org}/teams`)).body).toHaveLength(2);
    expect((await ownerAgent.post(`${org}/teams`, { name: "X", key: "XX" })).status).toBe(403);
  });
});

describe("pausing a connected agent", () => {
  it("revokes its OAuth grant, and reconnecting does not unpause it", async () => {
    const t = await startTestServer();
    const { owner, org, orgId } = await orgWithOwner(t.baseUrl, "Amirali");
    const { accessToken } = await connect(t.baseUrl, owner, orgId);
    const claude = bearer(t.baseUrl, accessToken);
    const agentId = (await claude.get("/organizations")).body[0].member.id;

    const paused = await owner.post(`${org}/agents/${agentId}/pause`);
    expect(paused.status).toBe(200);
    expect((await claude.get(`${org}/teams`)).status).toBe(401);

    const again = bearer(t.baseUrl, (await connect(t.baseUrl, owner, orgId)).accessToken);
    const res = await again.get(`${org}/teams`);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/paused/);

    await owner.post(`${org}/agents/${agentId}/resume`);
    expect((await again.get(`${org}/teams`)).status).toBe(200);
  });

  it("happens when the human leaves", async () => {
    const t = await startTestServer();
    const { owner, org, orgId } = await orgWithOwner(t.baseUrl);
    const { client: mina, memberId } = await join(t.baseUrl, owner, org, "Mina", "member");
    const claude = bearer(t.baseUrl, (await connect(t.baseUrl, mina, orgId)).accessToken);
    const agentId = (await claude.get("/organizations")).body[0].member.id;

    expect((await owner.delete(`${org}/members/${memberId}`)).status).toBe(204);
    expect((await claude.get(`${org}/teams`)).status).toBe(401);
    const agent = await owner.get(`${org}/agents/${agentId}`);
    expect(agent.body.pausedAt).not.toBeNull();
    expect((await owner.post(`${org}/agents/${agentId}/resume`)).status).toBe(409);
  });

  it("can be done by the human who connected it", async () => {
    const t = await startTestServer();
    const { owner, org, orgId } = await orgWithOwner(t.baseUrl);
    const { client: mina } = await join(t.baseUrl, owner, org, "Mina", "member");
    const claude = bearer(t.baseUrl, (await connect(t.baseUrl, mina, orgId)).accessToken);
    const agentId = (await claude.get("/organizations")).body[0].member.id;

    expect((await mina.post(`${org}/agents/${agentId}/pause`)).status).toBe(200);
  });
});
