import { describe, expect, it } from "vitest";
import { createTeam, join, orgWithOwner } from "./org.js";
import { startTestServer, type ApiClient } from "./server.js";

async function issue(client: ApiClient, org: string, teamId: string, body: Record<string, unknown> = {}) {
  const res = await client.post(`${org}/teams/${teamId}/issues`, { title: "An issue", ...body });
  expect(res.status).toBe(201);
  return res.body as { id: string; identifier: string; version: number };
}

async function comment(client: ApiClient, org: string, ref: string, body: string) {
  const res = await client.post(`${org}/issues/${ref}/comments`, { body });
  expect(res.status).toBe(201);
  return res.body as { id: string; issueId: string; creatorId: string; body: string; version: number };
}

describe("comments", () => {
  it("creates a markdown comment, lists it in order, and logs the event", async () => {
    const t = await startTestServer();
    const { owner, ownerId, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const one = await issue(owner, org, eng.id, { title: "First" });
    await issue(owner, org, eng.id);

    const first = await comment(owner, org, "ENG-1", "Tried it, **three** options:\n\n- reuse the webhook\n- poll");
    expect(first).toMatchObject({ issueId: one.id, creatorId: ownerId, version: 1 });
    expect(first.body).toContain("**three**");

    await comment(owner, org, "ENG-1", "Second thought");
    // A comment on another issue does not leak into this one's list.
    const last = await comment(owner, org, "ENG-2", "Unrelated");
    expect(last.issueId).not.toBe(one.id);
    const [created] = (await owner.get(`${org}/events?limit=1`)).body;
    expect(created).toMatchObject({ type: "comment.created", subjectId: last.id });

    const list = await owner.get(`${org}/issues/ENG-1/comments`);
    expect(list.status).toBe(200);
    expect(list.body.map((c: { body: string }) => c.body)).toEqual([
      "Tried it, **three** options:\n\n- reuse the webhook\n- poll",
      "Second thought",
    ]);
  });

  it("edits by whole version, and reports the current comment on a stale one", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await issue(owner, org, eng.id);
    const one = await comment(owner, org, "ENG-1", "Before");

    const edited = await owner.patch(`${org}/comments/${one.id}`, { version: 1, body: "After" });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ body: "After", version: 2 });
    expect(edited.body.updatedAt >= edited.body.createdAt).toBe(true);
    const [updated] = (await owner.get(`${org}/events?limit=1`)).body;
    expect(updated).toMatchObject({ type: "comment.updated", subjectId: one.id, data: { version: 2 } });

    const stale = await owner.patch(`${org}/comments/${one.id}`, { version: 1, body: "Late" });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ code: "conflict", current: { body: "After", version: 2 } });

    expect((await owner.get(`${org}/issues/ENG-1/comments`)).body.map((c: { body: string }) => c.body)).toEqual(["After"]);
  });

  it("lets only its creator edit it", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await issue(owner, org, eng.id);
    const one = await comment(owner, org, "ENG-1", "Mine");
    const { client: mia } = await join(t.baseUrl, owner, org, "Mia", "member", [eng.id]);

    const res = await mia.patch(`${org}/comments/${one.id}`, { version: 1, body: "Hers" });
    expect(res.status).toBe(403);
    expect((await mia.get(`${org}/issues/ENG-1/comments`)).body[0].body).toBe("Mine");
  });

  it("stops its creator editing once they can no longer see the issue", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const sec = await createTeam(owner, org, "SEC", { private: true });
    await issue(owner, org, sec.id);
    const { client: mia, memberId } = await join(t.baseUrl, owner, org, "Mia", "member", [sec.id]);
    const hers = await comment(mia, org, "SEC-1", "Mine");

    expect((await owner.delete(`${org}/teams/${sec.id}/members/${memberId}`)).status).toBe(204);
    const res = await mia.patch(`${org}/comments/${hers.id}`, { version: 1, body: "Still mine?" });
    expect(res.status).toBe(404);
    expect((await owner.get(`${org}/issues/SEC-1/comments`)).body[0].body).toBe("Mine");
  });

  it("follows the issue's visibility: comments on hidden and unknown issues are not found", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const sec = await createTeam(owner, org, "SEC", { private: true });
    await issue(owner, org, eng.id);
    const secret = await issue(owner, org, sec.id);
    const { client: mia } = await join(t.baseUrl, owner, org, "Mia", "member", [eng.id]);

    expect((await mia.get(`${org}/issues/SEC-1/comments`)).status).toBe(404);
    expect((await mia.post(`${org}/issues/SEC-1/comments`, { body: "Peek" })).status).toBe(404);
    expect((await owner.get(`${org}/issues/NOPE-9/comments`)).status).toBe(404);
    expect((await owner.post(`${org}/issues/SEC-1/comments`, { body: "Visible" })).status).toBe(201);
    expect((await mia.post(`${org}/issues/ENG-1/comments`, { body: "" })).status).toBe(400);
    const listed = (await mia.get(`${org}/issues/ENG-1/comments`)).body;
    expect(listed.filter((c: { issueId: string }) => c.issueId === secret.id)).toEqual([]);
  });

  it("lets a guest comment on a team they were invited to", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await issue(owner, org, eng.id);
    const { client: guest } = await join(t.baseUrl, owner, org, "Gus", "guest", [eng.id]);

    const res = await guest.get(`${org}/issues/ENG-1/comments`);
    expect(res.status).toBe(200);
    expect((await guest.post(`${org}/issues/ENG-1/comments`, { body: "From outside" })).status).toBe(201);
  });

  it("needs a sign-in", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await issue(owner, org, eng.id);
    const nobody = (await import("./server.js")).apiClient(t.baseUrl);

    expect((await nobody.get(`${org}/issues/ENG-1/comments`)).status).toBe(401);
    expect((await nobody.post(`${org}/issues/ENG-1/comments`, { body: "Hi" })).status).toBe(401);
  });
});
