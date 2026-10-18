import { describe, expect, it } from "vitest";
import { createTeam, join, orgWithOwner } from "./org.js";
import { startTestServer, type ApiClient } from "./server.js";

// A caller of /api/v1 that sends an API key instead of a session cookie.
function keyClient(baseUrl: string, secret: string) {
  const call = async (method: string, path: string, body?: unknown) => {
    const headers: Record<string, string> = { authorization: `Bearer ${secret}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined, headers: res.headers };
  };
  return {
    get: (path: string) => call("GET", path),
    post: (path: string, body?: unknown) => call("POST", path, body ?? {}),
    patch: (path: string, body: unknown) => call("PATCH", path, body),
    delete: (path: string) => call("DELETE", path),
  };
}

async function createAgent(admin: ApiClient, org: string, input: Record<string, unknown> = {}) {
  const res = await admin.post(`${org}/agents`, { name: "Ferro", ...input });
  expect(res.status).toBe(201);
  return res.body as { id: string; version: number; name: string };
}

async function createKey(admin: ApiClient, org: string, agentId: string, input: Record<string, unknown> = {}) {
  const res = await admin.post(`${org}/agents/${agentId}/api-keys`, { name: "CI", ...input });
  expect(res.status).toBe(201);
  return res.body as { apiKey: { id: string; prefix: string }; secret: string };
}

describe("agents", () => {
  it("lets an admin create an agent that shows up as a member", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");

    const created = await owner.post(`${org}/agents`, {
      name: "Ferro",
      description: "Runs our CI fixes",
      teamIds: [eng.id],
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: "Ferro",
      description: "Runs our CI fixes",
      role: "member",
      grants: [],
      connectedBy: null,
      clientName: null,
      pausedAt: null,
      version: 1,
    });

    const members = await owner.get(`${org}/members`);
    expect(members.body).toContainEqual(
      expect.objectContaining({ id: created.body.id, kind: "agent", name: "Ferro", email: null }),
    );
    const team = await owner.get(`${org}/teams/${eng.id}/members`);
    expect(team.body.map((m: { id: string }) => m.id)).toContain(created.body.id);

    const list = await owner.get(`${org}/agents`);
    expect(list.status).toBe(200);
    expect(list.body.map((a: { name: string }) => a.name)).toEqual(["Ferro"]);

    const events = await owner.get(`${org}/events`);
    expect(events.body.map((e: { type: string }) => e.type)).toContain("agent.created");
  });

  it("keeps creating and changing agents to Admins", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const { client: member } = await join(t.baseUrl, owner, org, "Mina", "member");

    expect((await member.post(`${org}/agents`, { name: "Ferro" })).status).toBe(403);
    const agent = await createAgent(owner, org);
    expect((await member.patch(`${org}/agents/${agent.id}`, { version: 1, name: "X" })).status).toBe(403);
    expect((await member.post(`${org}/agents/${agent.id}/api-keys`, { name: "k" })).status).toBe(403);
    // Everyone can see agents, to pick a delegate.
    expect((await member.get(`${org}/agents`)).status).toBe(200);
  });

  it("renames an agent with the version it read", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const agent = await createAgent(owner, org);

    const renamed = await owner.patch(`${org}/agents/${agent.id}`, { version: 1, name: "Ferro 2", grants: ["delete"] });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: "Ferro 2", grants: ["delete"], version: 2 });

    const stale = await owner.patch(`${org}/agents/${agent.id}`, { version: 1, name: "Ferro 3" });
    expect(stale.status).toBe(409);
  });

  it("refuses an agent as an Admin", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    expect((await owner.post(`${org}/agents`, { name: "Ferro", role: "admin" })).status).toBe(400);
  });
});

describe("API keys", () => {
  it("shows the secret once and lets the agent act as itself", async () => {
    const t = await startTestServer();
    const { owner, org, orgId } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const agent = await createAgent(owner, org, { teamIds: [eng.id] });

    const { apiKey, secret } = await createKey(owner, org, agent.id);
    expect(secret).toMatch(/^edict_ak_/);
    expect(secret.startsWith(apiKey.prefix)).toBe(true);

    const keys = await owner.get(`${org}/agents/${agent.id}/api-keys`);
    expect(keys.body).toHaveLength(1);
    expect(JSON.stringify(keys.body)).not.toContain(secret);

    const ferro = keyClient(t.baseUrl, secret);
    const memberships = await ferro.get("/organizations");
    expect(memberships.status).toBe(200);
    expect(memberships.body).toHaveLength(1);
    expect(memberships.body[0]).toMatchObject({ organization: { id: orgId }, member: { id: agent.id, kind: "agent" } });

    const issue = await ferro.post(`${org}/teams/${eng.id}/issues`, { title: "Fix the flaky test" });
    expect(issue.status).toBe(201);
    expect(issue.body.creatorId).toBe(agent.id);

    const events = await owner.get(`${org}/events`);
    const created = events.body.find((e: { type: string }) => e.type === "issue.created");
    expect(created).toMatchObject({ actorId: agent.id, onBehalfOfId: null });
  });

  it("rejects an unknown or revoked key", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const agent = await createAgent(owner, org);
    const { apiKey, secret } = await createKey(owner, org, agent.id);

    expect((await keyClient(t.baseUrl, "edict_ak_nope").get(`${org}/teams`)).status).toBe(401);
    expect((await keyClient(t.baseUrl, secret).get(`${org}/teams`)).status).toBe(200);

    expect((await owner.delete(`${org}/agents/${agent.id}/api-keys/${apiKey.id}`)).status).toBe(204);
    expect((await keyClient(t.baseUrl, secret).get(`${org}/teams`)).status).toBe(401);
    expect((await owner.get(`${org}/agents/${agent.id}/api-keys`)).body).toEqual([]);
  });

  it("does not open another organization", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const agent = await createAgent(owner, org);
    const { secret } = await createKey(owner, org, agent.id);
    const other = await owner.post("/organizations", { name: "Other", slug: "other" });

    const res = await keyClient(t.baseUrl, secret).get(`/organizations/${other.body.organization.id}/teams`);
    expect(res.status).toBe(404);
  });

  it("narrows the agent's teams to the key's teams", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const ops = await createTeam(owner, org, "OPS");
    const secret = await createTeam(owner, org, "SEC", { private: true });
    const agent = await createAgent(owner, org);

    // A Member agent sees public teams, like a human Member.
    const all = keyClient(t.baseUrl, (await createKey(owner, org, agent.id)).secret);
    expect((await all.get(`${org}/teams`)).body.map((x: { key: string }) => x.key)).toEqual(["ENG", "OPS"]);
    expect((await all.get(`${org}/teams/${secret.id}`)).status).toBe(404);

    const narrow = keyClient(t.baseUrl, (await createKey(owner, org, agent.id, { teamIds: [eng.id] })).secret);
    expect((await narrow.get(`${org}/teams`)).body.map((x: { key: string }) => x.key)).toEqual(["ENG"]);
    expect((await narrow.post(`${org}/teams/${ops.id}/issues`, { title: "Nope" })).status).toBe(404);
  });

  it("needs a session for what only people do", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const agent = await createAgent(owner, org);
    const ferro = keyClient(t.baseUrl, (await createKey(owner, org, agent.id)).secret);

    const res = await ferro.post("/organizations", { name: "Mine", slug: "mine" });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/agent/i);
  });
});

describe("agent guardrails", () => {
  it("keeps deletes, settings, members and agents from agents until granted", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const agent = await createAgent(owner, org, { teamIds: [eng.id] });
    const ferro = keyClient(t.baseUrl, (await createKey(owner, org, agent.id)).secret);

    const issue = await ferro.post(`${org}/teams/${eng.id}/issues`, { title: "Work" });
    expect(issue.status).toBe(201);
    const comment = await ferro.post(`${org}/issues/${issue.body.identifier}/comments`, { body: "On it" });
    expect(comment.status).toBe(201);

    expect((await ferro.delete(`${org}/issues/${issue.body.identifier}`)).status).toBe(403);
    expect((await ferro.delete(`${org}/comments/${comment.body.id}`)).status).toBe(403);
    expect((await ferro.post(`${org}/teams`, { name: "Mine", key: "MINE" })).status).toBe(403);
    expect((await ferro.post(`${org}/invites`, { email: "x@example.com" })).status).toBe(403);
    expect((await ferro.post(`${org}/agents`, { name: "Child" })).status).toBe(403);
    const ops = await createTeam(owner, org, "OPS");
    // Joining a team would widen its own access.
    expect((await ferro.post(`${org}/teams/${ops.id}/members`, { memberId: agent.id })).status).toBe(403);

    await owner.patch(`${org}/agents/${agent.id}`, {
      version: 1,
      grants: ["delete", "settings", "members", "agents"],
    });
    expect((await ferro.delete(`${org}/comments/${comment.body.id}`)).status).toBe(204);
    expect((await ferro.delete(`${org}/issues/${issue.body.identifier}`)).status).toBe(204);
    expect((await ferro.post(`${org}/teams`, { name: "Mine", key: "MINE" })).status).toBe(201);
    expect((await ferro.post(`${org}/invites`, { email: "x@example.com" })).status).toBe(201);
    expect((await ferro.post(`${org}/agents`, { name: "Child" })).status).toBe(201);
  });

  it("never lets an agent grant Owner powers", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const agent = await createAgent(owner, org, { grants: ["members"] });
    const ferro = keyClient(t.baseUrl, (await createKey(owner, org, agent.id)).secret);

    expect((await ferro.post(`${org}/invites`, { email: "o@example.com", role: "owner" })).status).toBe(403);
  });
});

describe("pause", () => {
  it("revokes every key, and a paused agent stays paused", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const agent = await createAgent(owner, org);
    const { secret } = await createKey(owner, org, agent.id);

    const paused = await owner.post(`${org}/agents/${agent.id}/pause`);
    expect(paused.status).toBe(200);
    expect(paused.body.pausedAt).not.toBeNull();
    expect((await keyClient(t.baseUrl, secret).get(`${org}/teams`)).status).toBe(401);
    expect((await owner.get(`${org}/agents/${agent.id}/api-keys`)).body).toEqual([]);
    expect((await owner.post(`${org}/agents/${agent.id}/api-keys`, { name: "again" })).status).toBe(409);

    const resumed = await owner.post(`${org}/agents/${agent.id}/resume`);
    expect(resumed.status).toBe(200);
    expect(resumed.body.pausedAt).toBeNull();
    // Resuming does not bring old keys back.
    expect((await keyClient(t.baseUrl, secret).get(`${org}/teams`)).status).toBe(401);
    const fresh = await createKey(owner, org, agent.id);
    expect((await keyClient(t.baseUrl, fresh.secret).get(`${org}/teams`)).status).toBe(200);

    const types = (await owner.get(`${org}/events`)).body.map((e: { type: string }) => e.type);
    expect(types).toEqual(expect.arrayContaining(["agent.paused", "agent.resumed", "api_key.created"]));
  });

  it("is for Admins", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const { client: member } = await join(t.baseUrl, owner, org, "Mina", "member");
    const agent = await createAgent(owner, org);
    expect((await member.post(`${org}/agents/${agent.id}/pause`)).status).toBe(403);
  });
});
