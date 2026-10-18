import { describe, expect, it } from "vitest";
import { createTeam, join, orgWithOwner } from "./org.js";
import { startTestServer, type ApiClient } from "./server.js";

async function issue(client: ApiClient, org: string, teamId: string, body: Record<string, unknown> = {}) {
  const res = await client.post(`${org}/teams/${teamId}/issues`, { title: "An issue", ...body });
  expect(res.status).toBe(201);
  return res.body as { id: string; identifier: string; version: number };
}

const identifiers = (list: { identifier: string }[]) => list.map((item) => item.identifier);

describe("trash", () => {
  it("trashes an issue with its sub-issues, hides them everywhere, and answers 410 for them", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const parent = await issue(owner, org, eng.id, { title: "Parent" });
    const child = await issue(owner, org, eng.id, { title: "Child", parentId: parent.id });
    await issue(owner, org, eng.id, { title: "Grandchild", parentId: child.id });
    const other = await issue(owner, org, eng.id, { title: "Other" });
    await owner.post(`${org}/issues/${other.identifier}/relations`, { type: "blocks", issue: "ENG-1" });
    await owner.post(`${org}/issues/ENG-1/comments`, { body: "Gone with it" });

    const res = await owner.delete(`${org}/issues/ENG-1`);
    expect(res.status).toBe(204);
    expect(res.headers.get("edict-change-id")).toMatch(/^[0-9a-f-]{36}$/);

    const list = (await owner.get(`${org}/teams/${eng.id}/issues`)).body;
    expect(identifiers(list)).toEqual(["ENG-4"]);
    expect((await owner.get(`${org}/issues/ENG-4/relations`)).body).toEqual([]);

    for (const ref of ["ENG-1", "ENG-2", "ENG-3", parent.id]) {
      const gone = await owner.get(`${org}/issues/${ref}`);
      expect(gone.status).toBe(410);
      expect(gone.body.error.code).toBe("gone");
      expect(gone.body.error.message).toMatch(/trash/);
      expect(gone.body.error.message).toMatch(/restore/);
    }
    expect((await owner.get(`${org}/issues/ENG-1/comments`)).status).toBe(410);
    expect((await owner.patch(`${org}/issues/ENG-1`, { version: 1, title: "Edit" })).status).toBe(410);
    expect((await owner.post(`${org}/teams/${eng.id}/issues`, { title: "New", parentId: parent.id })).status).toBe(400);

    const events = (await owner.get(`${org}/events?limit=3`)).body as { type: string; changeId: string; subjectId: string }[];
    expect(events.map((e) => e.type)).toEqual(["issue.deleted", "issue.deleted", "issue.deleted"]);
    expect(new Set(events.map((e) => e.changeId))).toEqual(new Set([res.headers.get("edict-change-id")]));
  });

  it("lists the trash and restores what one delete trashed, together", async () => {
    const t = await startTestServer();
    const { owner, ownerId, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const parent = await issue(owner, org, eng.id, { title: "Parent" });
    await issue(owner, org, eng.id, { title: "Child", parentId: parent.id });
    await issue(owner, org, eng.id, { title: "Loner" });
    // Trashed on its own first, so restoring the parent leaves it be.
    await issue(owner, org, eng.id, { title: "Earlier child", parentId: parent.id });
    expect((await owner.delete(`${org}/issues/ENG-4`)).status).toBe(204);
    expect((await owner.delete(`${org}/issues/ENG-1`)).status).toBe(204);

    const trash = (await owner.get(`${org}/trash`)).body as { identifier: string; deletedById: string; deletedAt: string }[];
    expect(identifiers(trash)).toEqual(["ENG-1", "ENG-2", "ENG-4"]);
    expect(trash[0]).toMatchObject({ deletedById: ownerId });

    // Restoring the child brings back everything its delete trashed.
    const restored = await owner.post(`${org}/issues/ENG-2/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ identifier: "ENG-2", parentId: parent.id });
    expect(identifiers((await owner.get(`${org}/teams/${eng.id}/issues`)).body)).toEqual(["ENG-3", "ENG-2", "ENG-1"]);
    expect(identifiers((await owner.get(`${org}/trash`)).body)).toEqual(["ENG-4"]);
    expect((await owner.get(`${org}/issues/ENG-1/sub-issues`)).body.map((s: { identifier: string }) => s.identifier)).toEqual(["ENG-2"]);
    const [event] = (await owner.get(`${org}/events?limit=1`)).body;
    expect(event.type).toBe("issue.restored");

    expect((await owner.post(`${org}/issues/ENG-1/restore`)).status).toBe(409);
  });

  it("trashes and restores a comment, by its creator or an admin", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await issue(owner, org, eng.id);
    const { client: mia } = await join(t.baseUrl, owner, org, "Mia", "member", [eng.id]);
    const { client: ben } = await join(t.baseUrl, owner, org, "Ben", "member", [eng.id]);
    const hers = (await mia.post(`${org}/issues/ENG-1/comments`, { body: "Hers" })).body;
    const his = (await ben.post(`${org}/issues/ENG-1/comments`, { body: "His" })).body;

    expect((await ben.delete(`${org}/comments/${hers.id}`)).status).toBe(403);
    expect((await mia.delete(`${org}/comments/${hers.id}`)).status).toBe(204);
    expect((await owner.delete(`${org}/comments/${his.id}`)).status).toBe(204);
    expect((await mia.get(`${org}/issues/ENG-1/comments`)).body).toEqual([]);
    expect((await mia.patch(`${org}/comments/${hers.id}`, { version: 1, body: "Edit" })).status).toBe(404);

    const restored = await mia.post(`${org}/comments/${hers.id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ body: "Hers" });
    expect((await mia.get(`${org}/issues/ENG-1/comments`)).body.map((c: { body: string }) => c.body)).toEqual(["Hers"]);
    expect((await mia.post(`${org}/comments/${hers.id}/restore`)).status).toBe(409);
  });

  it("keeps trashed issues of hidden teams out of the trash list", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const sec = await createTeam(owner, org, "SEC", { private: true });
    await issue(owner, org, eng.id);
    await issue(owner, org, sec.id);
    const { client: mia } = await join(t.baseUrl, owner, org, "Mia", "member", [eng.id]);
    await owner.delete(`${org}/issues/ENG-1`);
    await owner.delete(`${org}/issues/SEC-1`);

    expect(identifiers((await mia.get(`${org}/trash`)).body)).toEqual(["ENG-1"]);
    expect((await mia.get(`${org}/issues/SEC-1`)).status).toBe(404);
    expect((await mia.post(`${org}/issues/SEC-1/restore`)).status).toBe(404);
    expect((await mia.delete(`${org}/issues/SEC-1`)).status).toBe(404);
  });

  it("purges what has been in the trash for 30 days, files included, and keeps the events", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const parent = await issue(owner, org, eng.id, { title: "Old" });
    await issue(owner, org, eng.id, { title: "Child", parentId: parent.id });
    await issue(owner, org, eng.id, { title: "Kept" });
    const file = new FormData();
    file.append("file", new Blob(["bytes"], { type: "text/plain" }), "a.txt");
    const attachment = (await owner.postForm(`${org}/issues/ENG-1/attachments`, file)).body;
    const comment = (await owner.post(`${org}/issues/ENG-3/comments`, { body: "Trashed" })).body;
    await owner.delete(`${org}/comments/${comment.id}`);
    await owner.delete(`${org}/issues/ENG-1`);

    expect(await t.purgeTrash(new Date(Date.now() + 29 * 24 * 60 * 60 * 1000))).toEqual({ issues: 0, comments: 0, files: 0 });
    expect(await t.purgeTrash(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000))).toEqual({ issues: 2, comments: 1, files: 1 });

    expect((await owner.get(`${org}/issues/ENG-1`)).status).toBe(404);
    expect((await owner.get(`${org}/trash`)).body).toEqual([]);
    const served = await fetch(`${t.baseUrl}${attachment.path}`, { headers: { cookie: owner.cookie } });
    expect(served.status).toBe(404);
    expect(identifiers((await owner.get(`${org}/teams/${eng.id}/issues`)).body)).toEqual(["ENG-3"]);
    expect((await owner.get(`${org}/issues/ENG-3/comments`)).body).toEqual([]);
    const events = (await owner.get(`${org}/events?limit=200`)).body as { type: string; subjectId: string }[];
    expect(events.filter((e) => e.subjectId === parent.id).map((e) => e.type)).toEqual(["issue.deleted", "issue.created"]);
  });

  it("detaches a restored sub-issue from a parent the purge removes", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const parent = await issue(owner, org, eng.id);
    await issue(owner, org, eng.id, { parentId: parent.id });
    await owner.delete(`${org}/issues/ENG-2`);
    await owner.delete(`${org}/issues/ENG-1`);
    await owner.post(`${org}/issues/ENG-2/restore`);

    await t.purgeTrash(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000));
    expect((await owner.get(`${org}/issues/ENG-2`)).body).toMatchObject({ parentId: null });
  });

  it("starts and stops the background jobs with the server", async () => {
    const t = await startTestServer({ jobs: true });
    expect((await fetch(`${t.baseUrl}/health`)).status).toBe(200);
    await t.close();
  });
});
