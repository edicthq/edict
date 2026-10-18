import { describe, expect, it } from "vitest";
import { connect } from "./oauth-client.js";
import { createTeam, orgWithOwner } from "./org.js";
import { startTestServer, type ApiClient } from "./server.js";

// A caller of /api/v1 with a bearer credential: an API key or OAuth token.
export function bearerClient(baseUrl: string, token: string) {
  const call = async (method: string, path: string, body?: unknown) => {
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${baseUrl}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined, headers: res.headers };
  };
  return {
    get: (path: string) => call("GET", path),
    post: (path: string, body?: unknown) => call("POST", path, body ?? {}),
    patch: (path: string, body: unknown) => call("PATCH", path, body),
  };
}

// An admin-created agent with an API key, in the given teams.
export async function runner(baseUrl: string, admin: ApiClient, org: string, teamIds: string[], name = "Ferro") {
  const agent = await admin.post(`${org}/agents`, { name, teamIds });
  expect(agent.status).toBe(201);
  const key = await admin.post(`${org}/agents/${agent.body.id}/api-keys`, { name: "runner" });
  return { id: agent.body.id as string, client: bearerClient(baseUrl, key.body.secret) };
}

async function setup() {
  const t = await startTestServer();
  const { owner, org, orgId, ownerId } = await orgWithOwner(t.baseUrl, "Amirali");
  const eng = await createTeam(owner, org, "ENG");
  const issue = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Fix the login bug", assigneeId: ownerId })).body;
  return { t, owner, org, orgId, ownerId, eng, issue };
}

describe("delegating an issue", () => {
  it("puts the issue in the agent's queue while the assignee stays", async () => {
    const { t, owner, org, ownerId, eng, issue } = await setup();
    const ferro = await runner(t.baseUrl, owner, org, [eng.id]);

    const delegated = await owner.patch(`${org}/issues/${issue.identifier}`, { version: issue.version, delegateId: ferro.id });
    expect(delegated.status).toBe(200);
    expect(delegated.body).toMatchObject({ delegateId: ferro.id, assigneeId: ownerId });

    const work = await ferro.client.get(`${org}/my-work`);
    expect(work.status).toBe(200);
    expect(work.body.map((i: { identifier: string }) => i.identifier)).toEqual([issue.identifier]);

    // The assignee's own work includes it too.
    expect((await owner.get(`${org}/my-work`)).body.map((i: { id: string }) => i.id)).toEqual([issue.id]);

    // Undo takes the delegate off again.
    const undone = await owner.post(`${org}/changes/${delegated.headers.get("edict-change-id")}/undo`);
    expect(undone.status).toBe(200);
    expect((await owner.get(`${org}/issues/${issue.identifier}`)).body.delegateId).toBeNull();
    expect((await ferro.client.get(`${org}/my-work`)).body).toEqual([]);
  });

  it("only delegates to an active agent who can see the team", async () => {
    const { t, owner, org, ownerId, eng, issue } = await setup();
    const ops = await createTeam(owner, org, "OPS", { private: true });
    const paused = await runner(t.baseUrl, owner, org, [eng.id], "Sleepy");
    await owner.post(`${org}/agents/${paused.id}/pause`);

    for (const delegateId of [ownerId, paused.id]) {
      const res = await owner.patch(`${org}/issues/${issue.identifier}`, { version: issue.version, delegateId });
      expect(res.status).toBe(400);
    }
    // A Member agent sees public teams, but not a private one it is not in.
    const secret = (await owner.post(`${org}/teams/${ops.id}/issues`, { title: "Secret" })).body;
    const other = await runner(t.baseUrl, owner, org, [], "Other");
    const res = await owner.patch(`${org}/issues/${secret.identifier}`, { version: 1, delegateId: other.id });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/agent/);
  });

  it("can delegate to a connected agent, which then finds it in its queue", async () => {
    const { t, owner, org, orgId, issue } = await setup();
    const claude = bearerClient(t.baseUrl, (await connect(t.baseUrl, owner, orgId)).accessToken);
    const agentId = (await claude.get("/organizations")).body[0].member.id;

    const res = await owner.patch(`${org}/issues/${issue.identifier}`, { version: issue.version, delegateId: agentId });
    expect(res.status).toBe(200);
    expect((await claude.get(`${org}/my-work`)).body.map((i: { id: string }) => i.id)).toEqual([issue.id]);
  });

  it("leaves finished work out of the queue unless asked", async () => {
    const { t, owner, org, eng, issue } = await setup();
    const ferro = await runner(t.baseUrl, owner, org, [eng.id]);
    await owner.patch(`${org}/issues/${issue.identifier}`, { version: issue.version, delegateId: ferro.id });
    const statuses = (await owner.get(`${org}/teams/${eng.id}/statuses`)).body as { id: string; category: string }[];
    const done = statuses.find((s) => s.category === "done")!;
    await ferro.client.patch(`${org}/issues/${issue.identifier}`, { version: 2, statusId: done.id });

    expect((await ferro.client.get(`${org}/my-work`)).body).toEqual([]);
    expect((await ferro.client.get(`${org}/my-work?include=all`)).body).toHaveLength(1);
  });
});

describe("progress updates", () => {
  it("lets an agent report on an issue, and shows the latest on the issue", async () => {
    const { t, owner, org, eng, issue } = await setup();
    const ferro = await runner(t.baseUrl, owner, org, [eng.id]);

    const first = await ferro.client.post(`${org}/issues/${issue.identifier}/progress`, {
      state: "working",
      message: "Reading the **auth** code.",
    });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ issueId: issue.id, agentId: ferro.id, state: "working", links: [] });

    const second = await ferro.client.post(`${org}/issues/${issue.identifier}/progress`, {
      state: "done",
      message: "Fixed in the linked pull request.",
      links: [{ url: "https://github.com/edicthq/edict/pull/318", title: "Fix login" }],
    });
    expect(second.status).toBe(201);

    const shown = await owner.get(`${org}/issues/${issue.identifier}`);
    expect(shown.body.latestProgress).toMatchObject({ id: second.body.id, state: "done" });
    const list = await owner.get(`${org}/teams/${eng.id}/issues`);
    expect(list.body[0].latestProgress.id).toBe(second.body.id);

    const history = await owner.get(`${org}/issues/${issue.identifier}/progress`);
    expect(history.body.map((p: { state: string }) => p.state)).toEqual(["done", "working"]);

    const events = (await owner.get(`${org}/events`)).body as { type: string; actorId: string }[];
    expect(events.filter((e) => e.type === "progress.posted").map((e) => e.actorId)).toEqual([ferro.id, ferro.id]);
  });

  it("is for agents; people comment", async () => {
    const { owner, org, issue } = await setup();
    const res = await owner.post(`${org}/issues/${issue.identifier}/progress`, { state: "working", message: "Me" });
    expect(res.status).toBe(403);
  });

  it("rejects an unknown state and links that are not web URLs", async () => {
    const { t, owner, org, eng, issue } = await setup();
    const ferro = await runner(t.baseUrl, owner, org, [eng.id]);
    const path = `${org}/issues/${issue.identifier}/progress`;
    expect((await ferro.client.post(path, { state: "thinking", message: "Hm" })).status).toBe(400);
    expect((await ferro.client.post(path, { state: "working", message: "Hm", links: [{ url: "javascript:alert(1)" }] })).status).toBe(400);
  });

  it("stays out of teams the agent cannot see", async () => {
    const { t, owner, org, issue } = await setup();
    const ops = await createTeam(owner, org, "OPS");
    const ferro = await runner(t.baseUrl, owner, org, [ops.id]);
    const narrow = await owner.post(`${org}/agents/${ferro.id}/api-keys`, { name: "ops", teamIds: [ops.id] });
    const res = await bearerClient(t.baseUrl, narrow.body.secret).post(`${org}/issues/${issue.identifier}/progress`, {
      state: "working",
      message: "Hm",
    });
    expect(res.status).toBe(404);
  });
});
