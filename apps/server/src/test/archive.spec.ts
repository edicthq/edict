import { describe, expect, it } from "vitest";
import { createTeam, join, orgWithOwner } from "./org.js";
import { startTestServer, type ApiClient } from "./server.js";

type Issue = { id: string; identifier: string; version: number; closedAt: string | null; archivedAt: string | null };
type Status = { id: string; name: string; category: string };

async function issue(client: ApiClient, org: string, teamId: string, body: Record<string, unknown> = {}): Promise<Issue> {
  const res = await client.post(`${org}/teams/${teamId}/issues`, { title: "An issue", ...body });
  expect(res.status).toBe(201);
  return res.body;
}

async function statusOf(client: ApiClient, org: string, teamId: string, category: string): Promise<Status> {
  const statuses: Status[] = (await client.get(`${org}/teams/${teamId}/statuses`)).body;
  return statuses.find((s) => s.category === category)!;
}

const DAY = 24 * 60 * 60 * 1000;

describe("archive", () => {
  it("records when an issue closes, and forgets it when the issue reopens", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const done = await statusOf(owner, org, eng.id, "done");
    const todo = await statusOf(owner, org, eng.id, "todo");
    const one = await issue(owner, org, eng.id);
    expect(one.closedAt).toBeNull();

    const closed = (await owner.patch(`${org}/issues/ENG-1`, { version: one.version, statusId: done.id })).body as Issue;
    expect(closed.closedAt).not.toBeNull();
    const reopened = (await owner.patch(`${org}/issues/ENG-1`, { version: closed.version, statusId: todo.id })).body as Issue;
    expect(reopened.closedAt).toBeNull();
    expect((await issue(owner, org, eng.id, { statusId: done.id })).closedAt).not.toBeNull();
  });

  it("archives closed issues by hand, refuses open ones, and keeps identifiers resolving", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const done = await statusOf(owner, org, eng.id, "done");
    await issue(owner, org, eng.id, { title: "Open" });
    await issue(owner, org, eng.id, { title: "Shipped", statusId: done.id });

    expect((await owner.post(`${org}/issues/ENG-1/archive`)).status).toBe(400);
    const archived = await owner.post(`${org}/issues/ENG-2/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.archivedAt).not.toBeNull();

    // Out of the team's list, still found by identifier and by search.
    const list = (await owner.get(`${org}/teams/${eng.id}/issues`)).body as Issue[];
    expect(list.map((i) => i.identifier)).toEqual(["ENG-1"]);
    expect((await owner.get(`${org}/issues/ENG-2`)).body.archivedAt).not.toBeNull();
    const found = (await owner.get(`${org}/issues?q=Shipped&include=all`)).body as Issue[];
    expect(found.map((i) => i.identifier)).toEqual(["ENG-2"]);

    const back = await owner.post(`${org}/issues/ENG-2/unarchive`);
    expect(back.body.archivedAt).toBeNull();
    const events = (await owner.get(`${org}/events?limit=2`)).body.map((e: { type: string }) => e.type);
    expect(events).toEqual(["issue.unarchived", "issue.archived"]);
  });

  it("pages a team's archived issues, newest number first", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const done = await statusOf(owner, org, eng.id, "done");
    for (let i = 0; i < 5; i++) {
      const made = await issue(owner, org, eng.id, { statusId: done.id });
      await owner.post(`${org}/issues/${made.identifier}/archive`);
    }
    const first = (await owner.get(`${org}/teams/${eng.id}/issues?archived=true&limit=2`)).body as Issue[];
    expect(first.map((i) => i.identifier)).toEqual(["ENG-5", "ENG-4"]);
    const next = (await owner.get(`${org}/teams/${eng.id}/issues?archived=true&limit=2&before=4`)).body as Issue[];
    expect(next.map((i) => i.identifier)).toEqual(["ENG-3", "ENG-2"]);
  });

  it("archives issues closed longer than the team's setting, and unarchives one that reopens", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const ops = await createTeam(owner, org, "OPS");
    const done = await statusOf(owner, org, eng.id, "done");
    const opsDone = await statusOf(owner, org, ops.id, "done");
    expect((await owner.get(`${org}/teams/${eng.id}`)).body.archiveAfterDays).toBe(30);
    const keep = (await owner.patch(`${org}/teams/${ops.id}`, { version: ops.version, archiveAfterDays: null })).body;
    expect(keep.archiveAfterDays).toBeNull();
    await issue(owner, org, eng.id, { title: "Closed", statusId: done.id });
    await issue(owner, org, eng.id, { title: "Open" });
    await issue(owner, org, ops.id, { title: "Kept", statusId: opsDone.id });

    expect(await t.archiveIssues(new Date(Date.now() + 10 * DAY))).toBe(0);
    expect(await t.archiveIssues(new Date(Date.now() + 31 * DAY))).toBe(1);
    const archived = (await owner.get(`${org}/issues/ENG-1`)).body as Issue;
    expect(archived.archivedAt).not.toBeNull();
    expect((await owner.get(`${org}/issues/OPS-1`)).body.archivedAt).toBeNull();
    const [event] = (await owner.get(`${org}/events?limit=1`)).body;
    expect(event).toMatchObject({ type: "issue.archived", data: { automatic: true } });

    const todo = await statusOf(owner, org, eng.id, "todo");
    const reopened = (await owner.patch(`${org}/issues/ENG-1`, { version: archived.version, statusId: todo.id })).body as Issue;
    expect(reopened.archivedAt).toBeNull();
  });
});

describe("team trash", () => {
  it("trashes a team with everything in it, and restores it together", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await issue(owner, org, eng.id, { title: "Inside" });

    const res = await owner.delete(`${org}/teams/${eng.id}`);
    expect(res.status).toBe(204);
    expect((await owner.get(`${org}/teams`)).body).toEqual([]);
    expect((await owner.get(`${org}/teams/${eng.id}`)).status).toBe(404);
    const gone = await owner.get(`${org}/issues/ENG-1`);
    expect(gone.status).toBe(410);
    expect(gone.body.error.message).toMatch(/ENG is in the trash/);
    expect((await owner.get(`${org}/issues?q=Inside&include=all`)).body).toEqual([]);
    // Its key stays reserved while it waits.
    expect((await owner.post(`${org}/teams`, { name: "Other", key: "ENG" })).status).toBe(409);

    const trash = (await owner.get(`${org}/trash/teams`)).body as { id: string; key: string }[];
    expect(trash).toEqual([expect.objectContaining({ id: eng.id, key: "ENG" })]);
    const restored = await owner.post(`${org}/teams/${eng.id}/restore`);
    expect(restored.status).toBe(200);
    expect((await owner.get(`${org}/issues/ENG-1`)).status).toBe(200);
  });

  it("is for Admins, and purges a team 30 days after deletion, releasing its key", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await issue(owner, org, eng.id);
    const { client: mina } = await join(t.baseUrl, owner, org, "Mina", "member", [eng.id]);
    expect((await mina.delete(`${org}/teams/${eng.id}`)).status).toBe(403);
    await owner.delete(`${org}/teams/${eng.id}`);

    await t.purgeTrash(new Date(Date.now() + 29 * DAY));
    expect((await owner.get(`${org}/trash/teams`)).body).toHaveLength(1);
    const purged = await t.purgeTrash(new Date(Date.now() + 31 * DAY));
    expect(purged.teams).toBe(1);
    expect((await owner.get(`${org}/trash/teams`)).body).toEqual([]);
    expect((await owner.post(`${org}/teams`, { name: "Again", key: "ENG" })).status).toBe(201);
    expect((await owner.get(`${org}/issues/ENG-1`)).status).toBe(404);
  });

  it("purges trashed projects 30 days after deletion", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const project = (await owner.post(`${org}/projects`, { name: "Old" })).body;
    await owner.delete(`${org}/projects/${project.id}`);
    const purged = await t.purgeTrash(new Date(Date.now() + 31 * DAY));
    expect(purged.projects).toBe(1);
    expect((await owner.get(`${org}/trash/projects`)).body).toEqual([]);
  });
});
