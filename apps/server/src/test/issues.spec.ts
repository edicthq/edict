import { describe, expect, it } from "vitest";
import { createTeam, join, orgWithOwner } from "./org.js";
import { signUpAs, startTestServer, type ApiClient } from "./server.js";

type Status = { id: string; name: string; category: string };
type Issue = {
  id: string;
  identifier: string;
  number: number;
  teamId: string;
  title: string;
  description: string;
  statusId: string;
  priority: string;
  estimate: number | null;
  assigneeId: string | null;
  creatorId: string;
  version: number;
};

async function statusNamed(client: ApiClient, org: string, teamId: string, name: string): Promise<Status> {
  const statuses: Status[] = (await client.get(`${org}/teams/${teamId}/statuses`)).body;
  return statuses.find((s) => s.name === name)!;
}

async function createIssue(client: ApiClient, org: string, teamId: string, body: Record<string, unknown> = {}) {
  const res = await client.post(`${org}/teams/${teamId}/issues`, { title: "Fix the login bug", ...body });
  expect(res.status).toBe(201);
  return res.body as Issue;
}

describe("issues", () => {
  it("creates issues numbered within their team, in the default status", async () => {
    const t = await startTestServer();
    const { owner, org, ownerId } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const des = await createTeam(owner, org, "DES");
    const todo = await statusNamed(owner, org, eng.id, "Todo");

    const first = await owner.post(`${org}/teams/${eng.id}/issues`, {
      title: "Fix the login bug",
      description: "Steps:\n\n1. Open `/login`\n2. **Nothing happens**",
    });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      identifier: "ENG-1",
      number: 1,
      teamId: eng.id,
      title: "Fix the login bug",
      description: "Steps:\n\n1. Open `/login`\n2. **Nothing happens**",
      statusId: todo.id,
      priority: "none",
      estimate: null,
      assigneeId: null,
      creatorId: ownerId,
      version: 1,
    });

    expect((await createIssue(owner, org, eng.id)).identifier).toBe("ENG-2");
    expect((await createIssue(owner, org, des.id)).identifier).toBe("DES-1");
  });

  it("gives concurrent creations distinct numbers", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");

    const created = await Promise.all(
      Array.from({ length: 8 }, (_, i) => createIssue(owner, org, eng.id, { title: `Issue ${i}` })),
    );
    expect(created.map((issue) => issue.number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("takes status, priority, estimate and assignee on creation", async () => {
    const t = await startTestServer();
    const { owner, org, ownerId } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const inProgress = await statusNamed(owner, org, eng.id, "In Progress");

    const issue = await createIssue(owner, org, eng.id, {
      statusId: inProgress.id,
      priority: "urgent",
      estimate: 3,
      assigneeId: ownerId,
    });
    expect(issue).toMatchObject({ statusId: inProgress.id, priority: "urgent", estimate: 3, assigneeId: ownerId });
  });

  it("rejects a status from another team and an assignee who cannot see the team", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const ops = await createTeam(owner, org, "OPS", { private: true });
    const opsTodo = await statusNamed(owner, org, ops.id, "Todo");
    const { memberId: mia } = await join(t.baseUrl, owner, org, "Mia", "member");

    const wrongStatus = await owner.post(`${org}/teams/${eng.id}/issues`, { title: "x", statusId: opsTodo.id });
    expect(wrongStatus.status).toBe(400);
    expect(wrongStatus.body.error.message).toMatch(/status/i);

    const outsider = await owner.post(`${org}/teams/${ops.id}/issues`, { title: "x", assigneeId: mia });
    expect(outsider.status).toBe(400);
    expect(outsider.body.error.message).toMatch(/assignee/i);

    const blank = await owner.post(`${org}/teams/${eng.id}/issues`, { title: "   " });
    expect(blank.status).toBe(400);
  });

  it("records the creation in the event log", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const issue = await createIssue(owner, org, eng.id);

    const [latest] = (await owner.get(`${org}/events?limit=1`)).body;
    expect(latest).toMatchObject({
      type: "issue.created",
      subjectId: issue.id,
      data: { identifier: "ENG-1", title: "Fix the login bug" },
    });
  });

  it("finds an issue by id or identifier, in any case", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const issue = await createIssue(owner, org, eng.id);

    for (const ref of [issue.id, "ENG-1", "eng-1"]) {
      const res = await owner.get(`${org}/issues/${ref}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(issue.id);
    }
    expect((await owner.get(`${org}/issues/ENG-2`)).status).toBe(404);
    expect((await owner.get(`${org}/issues/NOPE-1`)).status).toBe(404);
    expect((await owner.get(`${org}/issues/not-an-issue`)).status).toBe(404);
  });

  it("lists a team's issues, newest first", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await createIssue(owner, org, eng.id, { title: "One" });
    await createIssue(owner, org, eng.id, { title: "Two" });

    const res = await owner.get(`${org}/teams/${eng.id}/issues`);
    expect(res.status).toBe(200);
    expect(res.body.map((issue: Issue) => issue.identifier)).toEqual(["ENG-2", "ENG-1"]);
  });

  it("hides issues in teams the caller cannot see", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const ops = await createTeam(owner, org, "OPS", { private: true });
    await createIssue(owner, org, ops.id);
    await createIssue(owner, org, eng.id);
    const { client: guest } = await join(t.baseUrl, owner, org, "Gus", "guest", [ops.id]);
    const { client: member } = await join(t.baseUrl, owner, org, "Mia", "member");
    const stranger = await signUpAs(t.baseUrl, "Stranger");

    expect((await guest.get(`${org}/issues/OPS-1`)).status).toBe(200);
    expect((await guest.get(`${org}/issues/ENG-1`)).status).toBe(404);
    expect((await guest.get(`${org}/teams/${eng.id}/issues`)).status).toBe(404);
    expect((await member.get(`${org}/issues/ENG-1`)).status).toBe(200);
    expect((await member.get(`${org}/issues/OPS-1`)).status).toBe(404);
    expect((await member.post(`${org}/teams/${ops.id}/issues`, { title: "x" })).status).toBe(404);
    expect((await stranger.get(`${org}/issues/ENG-1`)).status).toBe(404);

    // Guests work in the teams they belong to.
    const created = await guest.post(`${org}/teams/${ops.id}/issues`, { title: "From a guest" });
    expect(created.status).toBe(201);
  });
});

describe("updating issues", () => {
  it("changes fields, bumps the version and records old and new values", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const issue = await createIssue(owner, org, eng.id);
    const done = await statusNamed(owner, org, eng.id, "Done");

    const res = await owner.patch(`${org}/issues/ENG-1`, {
      version: 1,
      title: "Fix the sign-in bug",
      statusId: done.id,
      priority: "high",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: "Fix the sign-in bug", statusId: done.id, priority: "high", version: 2 });

    const [latest] = (await owner.get(`${org}/events?limit=1`)).body;
    expect(latest).toMatchObject({
      type: "issue.updated",
      subjectId: issue.id,
      data: {
        version: 2,
        changes: {
          title: { from: "Fix the login bug", to: "Fix the sign-in bug" },
          statusId: { from: issue.statusId, to: done.id },
          priority: { from: "none", to: "high" },
        },
      },
    });
  });

  it("requires the version the change started from", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await createIssue(owner, org, eng.id);

    const res = await owner.patch(`${org}/issues/ENG-1`, { title: "No version" });
    expect(res.status).toBe(400);
  });

  it("conflicts only when a field it changes was changed since its version", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const issue = await createIssue(owner, org, eng.id);
    const inProgress = await statusNamed(owner, org, eng.id, "In Progress");
    const done = await statusNamed(owner, org, eng.id, "Done");

    // A human edits the title from version 1...
    expect((await owner.patch(`${org}/issues/ENG-1`, { version: 1, title: "Edited" })).status).toBe(200);

    // ...and an agent that also read version 1 moves the status: no overlap.
    const moved = await owner.patch(`${org}/issues/ENG-1`, { version: 1, statusId: inProgress.id });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ title: "Edited", statusId: inProgress.id, version: 3 });

    // A second write of the status from version 1 is stale.
    const stale = await owner.patch(`${org}/issues/ENG-1`, { version: 1, statusId: done.id });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({
      code: "conflict",
      fields: ["statusId"],
      current: { id: issue.id, statusId: inProgress.id, version: 3 },
    });

    // Writing the value it already has is not a conflict.
    const same = await owner.patch(`${org}/issues/ENG-1`, { version: 1, statusId: inProgress.id });
    expect(same.status).toBe(200);
    expect(same.body.version).toBe(3);

    // A version from the future is refused.
    const future = await owner.patch(`${org}/issues/ENG-1`, { version: 9, title: "x" });
    expect(future.status).toBe(409);
  });

  it("validates the new values like creation does", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const des = await createTeam(owner, org, "DES");
    await createIssue(owner, org, eng.id);
    const desTodo = await statusNamed(owner, org, des.id, "Todo");

    expect((await owner.patch(`${org}/issues/ENG-1`, { version: 1, statusId: desTodo.id })).status).toBe(400);
    expect((await owner.patch(`${org}/issues/ENG-1`, { version: 1, priority: "whenever" })).status).toBe(400);
    expect((await owner.patch(`${org}/issues/ENG-1`, { version: 1, estimate: -1 })).status).toBe(400);

    const cleared = await owner.patch(`${org}/issues/ENG-1`, { version: 1, estimate: 5 });
    expect(cleared.body.estimate).toBe(5);
    const nulled = await owner.patch(`${org}/issues/ENG-1`, { version: 2, estimate: null });
    expect(nulled.body.estimate).toBeNull();
  });
});

describe("identifiers", () => {
  it("keep resolving after the team key changes", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const issue = await createIssue(owner, org, eng.id);

    const renamed = await owner.patch(`${org}/teams/${eng.id}`, { version: eng.version, key: "CORE" });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ key: "CORE", version: eng.version + 1 });

    for (const ref of ["CORE-1", "ENG-1"]) {
      const res = await owner.get(`${org}/issues/${ref}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: issue.id, identifier: "CORE-1" });
    }
    expect((await createIssue(owner, org, eng.id)).identifier).toBe("CORE-2");
  });

  it("keep a retired key for its team", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const renamed = (await owner.patch(`${org}/teams/${eng.id}`, { version: eng.version, key: "CORE" })).body;

    const taken = await owner.post(`${org}/teams`, { name: "New", key: "ENG" });
    expect(taken.status).toBe(409);
    expect(taken.body.error.message).toMatch(/ENG/);

    const other = await createTeam(owner, org, "DES");
    const stolen = await owner.patch(`${org}/teams/${other.id}`, { version: other.version, key: "ENG" });
    expect(stolen.status).toBe(409);

    const back = await owner.patch(`${org}/teams/${eng.id}`, { version: renamed.version, key: "ENG" });
    expect(back.status).toBe(200);
    expect(back.body.key).toBe("ENG");
  });

  it("only admins and owners change a team, at its current version", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const { client: member } = await join(t.baseUrl, owner, org, "Mia", "member", [eng.id]);

    expect((await member.patch(`${org}/teams/${eng.id}`, { version: eng.version, name: "Eng" })).status).toBe(403);
    expect((await owner.patch(`${org}/teams/${eng.id}`, { version: eng.version, name: "Engineering" })).status).toBe(200);
    expect((await owner.patch(`${org}/teams/${eng.id}`, { version: eng.version, name: "Stale" })).status).toBe(409);
  });

  it("bulk updates multiple issues in one transaction and change", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const inProgress = await statusNamed(owner, org, eng.id, "In Progress");
    const first = await createIssue(owner, org, eng.id, { title: "First" });
    const second = await createIssue(owner, org, eng.id, { title: "Second" });

    const bulk = await owner.post(`${org}/issues/bulk-update`, {
      issues: [
        { id: first.id, version: first.version },
        { id: second.id, version: second.version },
      ],
      statusId: inProgress.id,
      priority: "high",
    });
    expect(bulk.status).toBe(200);
    expect(bulk.body.updated).toHaveLength(2);
    expect(bulk.body.updated[0].statusId).toBe(inProgress.id);
    expect(bulk.body.updated[0].priority).toBe("high");
    expect(bulk.body.updated[1].statusId).toBe(inProgress.id);
    expect(bulk.body.updated[1].priority).toBe("high");

    const changeId = bulk.headers.get("edict-change-id");
    expect(changeId).toBeTruthy();
    const events: { type: string; changeId: string }[] = (await owner.get(`${org}/events?limit=2`)).body;
    expect(events[0]!.changeId).toBe(changeId);
    expect(events[1]!.changeId).toBe(changeId);
  });

  it("bulk update refuses with 409 and rolls back if an issue version is stale", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const first = await createIssue(owner, org, eng.id, { title: "First" });
    const second = await createIssue(owner, org, eng.id, { title: "Second" });

    await owner.patch(`${org}/issues/${second.identifier}`, {
      version: second.version,
      priority: "low",
    });

    const bulk = await owner.post(`${org}/issues/bulk-update`, {
      issues: [
        { id: first.id, version: first.version },
        { id: second.id, version: second.version },
      ],
      priority: "urgent",
    });
    expect(bulk.status).toBe(409);

    const firstCheck = (await owner.get(`${org}/issues/${first.identifier}`)).body;
    expect(firstCheck.priority).toBe("none");
  });
});

describe("changes", () => {
  it("events from one request share a change id", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    await createTeam(owner, org, "ENG");
    await createTeam(owner, org, "DES");

    const events: { type: string; changeId: string; data: { key?: string } }[] = (
      await owner.get(`${org}/events?limit=4`)
    ).body;
    expect(events.map((e) => e.type)).toEqual([
      "team.member_added",
      "team.created",
      "team.member_added",
      "team.created",
    ]);
    expect(events[0]!.changeId).toBe(events[1]!.changeId);
    expect(events[2]!.changeId).toBe(events[3]!.changeId);
    expect(events[0]!.changeId).not.toBe(events[2]!.changeId);
  });
});
