import { describe, expect, it } from "vitest";
import { runner } from "./agent-client.js";
import { createTeam, join, orgWithOwner } from "./org.js";
import { startTestServer } from "./server.js";

describe("links", () => {
  it("attaches a URL to an issue once, and lists it", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const issue = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Ship it" })).body;
    const path = `${org}/issues/${issue.identifier}/links`;

    const added = await owner.post(path, { url: "https://github.com/edicthq/edict/pull/318", title: "Fix login" });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ issueId: issue.id, url: "https://github.com/edicthq/edict/pull/318", title: "Fix login" });

    // Attaching the same URL again finds the link it already has.
    const again = await owner.post(path, { url: "https://github.com/edicthq/edict/pull/318" });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(added.body.id);

    expect((await owner.get(path)).body.map((l: { id: string }) => l.id)).toEqual([added.body.id]);
    expect((await owner.post(path, { url: "ftp://example.com/x" })).status).toBe(400);
  });

  it("lets agents attach links but not remove them without the delete power", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const issue = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Ship it" })).body;
    const ferro = await runner(t.baseUrl, owner, org, [eng.id]);
    const path = `${org}/issues/${issue.identifier}/links`;

    const link = await ferro.client.post(path, { url: "https://example.com/pr/1" });
    expect(link.status).toBe(201);
    expect((await ferro.client.delete(`${path}/${link.body.id}`)).status).toBe(403);
    const del = await fetch(`${t.baseUrl}/api/v1${path}/${link.body.id}`, { method: "DELETE", headers: { cookie: owner.cookie! } });
    expect(del.status).toBe(204);
    expect((await owner.get(path)).body).toEqual([]);
  });

  it("undoes adding and removing a link", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const issue = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Ship it" })).body;
    const path = `${org}/issues/${issue.identifier}/links`;

    const added = await owner.post(path, { url: "https://example.com/a" });
    const removed = await owner.delete(`${path}/${added.body.id}`);
    expect((await owner.post(`${org}/changes/${removed.headers.get("edict-change-id")}/undo`)).status).toBe(200);
    expect((await owner.get(path)).body.map((l: { id: string }) => l.id)).toEqual([added.body.id]);
    expect((await owner.post(`${org}/changes/${added.headers.get("edict-change-id")}/undo`)).status).toBe(200);
    expect((await owner.get(path)).body).toEqual([]);
  });
});

describe("searching issues", () => {
  async function seed() {
    const t = await startTestServer();
    const { owner, org, ownerId } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const ops = await createTeam(owner, org, "OPS", { private: true });
    const make = async (teamId: string, title: string, extra: Record<string, unknown> = {}) =>
      (await owner.post(`${org}/teams/${teamId}/issues`, { title, ...extra })).body as { id: string; identifier: string; version: number };
    const login = await make(eng.id, "Fix the login redirect", { description: "Users bounce back after OAuth.", assigneeId: ownerId });
    const csv = await make(eng.id, "Export issues as CSV", { priority: "urgent" });
    const copy = await make(ops.id, "Login page copy");
    return { t, owner, org, ownerId, eng, ops, login, csv, copy };
  }

  const ids = (body: { identifier: string }[]) => body.map((issue) => issue.identifier).sort();

  it("finds issues across teams by words in the title and description", async () => {
    const { owner, org, login, copy } = await seed();
    expect(ids((await owner.get(`${org}/issues?q=login`)).body)).toEqual([login.identifier, copy.identifier].sort());
    expect(ids((await owner.get(`${org}/issues?q=oauth`)).body)).toEqual([login.identifier]);
    // Part of a word, and an identifier.
    expect(ids((await owner.get(`${org}/issues?q=redir`)).body)).toEqual([login.identifier]);
    expect(ids((await owner.get(`${org}/issues?q=${login.identifier.toLowerCase()}`)).body)).toEqual([login.identifier]);
  });

  it("filters by team, assignee, delegate, label, priority and status category", async () => {
    const { t, owner, org, ownerId, eng, ops, login, csv, copy } = await seed();
    expect(ids((await owner.get(`${org}/issues?teamId=${ops.id}`)).body)).toEqual([copy.identifier]);
    expect(ids((await owner.get(`${org}/issues?assigneeId=${ownerId}`)).body)).toEqual([login.identifier]);
    expect(ids((await owner.get(`${org}/issues?priority=urgent`)).body)).toEqual([csv.identifier]);

    const ferro = await runner(t.baseUrl, owner, org, [eng.id]);
    await owner.patch(`${org}/issues/${csv.identifier}`, { version: csv.version, delegateId: ferro.id });
    expect(ids((await owner.get(`${org}/issues?delegateId=${ferro.id}`)).body)).toEqual([csv.identifier]);

    const bug = (await owner.post(`${org}/labels`, { name: "bug" })).body;
    await owner.patch(`${org}/issues/${login.identifier}`, { version: 1, labelIds: [bug.id] });
    expect(ids((await owner.get(`${org}/issues?labelId=${bug.id}`)).body)).toEqual([login.identifier]);

    const done = ((await owner.get(`${org}/teams/${eng.id}/statuses`)).body as { id: string; category: string }[]).find(
      (s) => s.category === "done",
    )!;
    await owner.patch(`${org}/issues/${login.identifier}`, { version: 2, statusId: done.id });
    expect(ids((await owner.get(`${org}/issues?q=login`)).body)).toEqual([copy.identifier]);
    expect(ids((await owner.get(`${org}/issues?q=login&include=all`)).body)).toEqual([login.identifier, copy.identifier].sort());
    expect(ids((await owner.get(`${org}/issues?statusCategory=done`)).body)).toEqual([login.identifier]);
  });

  it("leaves out trashed issues and teams the caller cannot see", async () => {
    const { t, owner, org, login, csv } = await seed();
    await owner.delete(`${org}/issues/${csv.identifier}`);
    expect(ids((await owner.get(`${org}/issues`)).body)).not.toContain(csv.identifier);

    const { client: mina } = await join(t.baseUrl, owner, org, "Mina", "member");
    expect(ids((await mina.get(`${org}/issues?q=login`)).body)).toEqual([login.identifier]);
  });

  it("pages with a limit", async () => {
    const { owner, org } = await seed();
    expect((await owner.get(`${org}/issues?limit=2`)).body).toHaveLength(2);
    expect((await owner.get(`${org}/issues?limit=0`)).status).toBe(400);
  });
});
