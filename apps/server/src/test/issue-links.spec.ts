import { describe, expect, it } from "vitest";
import { createTeam, join, orgWithOwner } from "./org.js";
import { startTestServer, type ApiClient } from "./server.js";

async function issue(client: ApiClient, org: string, teamId: string, body: Record<string, unknown> = {}) {
  const res = await client.post(`${org}/teams/${teamId}/issues`, { title: "An issue", ...body });
  expect(res.status).toBe(201);
  return res.body as { id: string; identifier: string; version: number; statusId: string };
}

describe("sub-issues", () => {
  it("an issue takes a parent from any team it can see, and the parent lists it", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const ops = await createTeam(owner, org, "OPS");
    const parent = await issue(owner, org, eng.id, { title: "Parent" });
    const child = await issue(owner, org, ops.id, { title: "Child", parentId: parent.id });
    expect(child).toMatchObject({ parentId: parent.id });

    const other = await issue(owner, org, eng.id, { title: "Later child" });
    const res = await owner.patch(`${org}/issues/${other.identifier}`, { version: 1, parentId: parent.id });
    expect(res.status).toBe(200);

    const subs = await owner.get(`${org}/issues/ENG-1/sub-issues`);
    expect(subs.status).toBe(200);
    expect(subs.body.map((i: { identifier: string }) => i.identifier)).toEqual(["OPS-1", "ENG-2"]);
  });

  it("refuses a parent that would make a cycle", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const a = await issue(owner, org, eng.id);
    const b = await issue(owner, org, eng.id, { parentId: a.id });
    const c = await issue(owner, org, eng.id, { parentId: b.id });

    const self = await owner.patch(`${org}/issues/${a.identifier}`, { version: 1, parentId: a.id });
    expect(self.status).toBe(400);
    const loop = await owner.patch(`${org}/issues/${a.identifier}`, { version: 1, parentId: c.id });
    expect(loop.status).toBe(400);
    expect(loop.body.error.message).toMatch(/cycle|sub-issue/i);
  });

  it("hides sub-issues in teams the caller cannot see, and refuses a parent it cannot see", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const sec = await createTeam(owner, org, "SEC", { private: true });
    const parent = await issue(owner, org, eng.id);
    await issue(owner, org, sec.id, { parentId: parent.id });
    const secret = await issue(owner, org, sec.id);
    const { client: mia } = await join(t.baseUrl, owner, org, "Mia", "member");

    expect((await mia.get(`${org}/issues/ENG-1/sub-issues`)).body).toEqual([]);
    const res = await mia.post(`${org}/teams/${eng.id}/issues`, { title: "x", parentId: secret.id });
    expect(res.status).toBe(400);
  });
});

describe("relations", () => {
  it("blocks reads as blocked by from the other side", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await issue(owner, org, eng.id);
    await issue(owner, org, eng.id);

    const added = await owner.post(`${org}/issues/ENG-1/relations`, { type: "blocks", issue: "ENG-2" });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ type: "blocks", issue: { identifier: "ENG-2" } });

    const fromTwo = (await owner.get(`${org}/issues/ENG-2/relations`)).body;
    expect(fromTwo).toMatchObject([{ type: "blocked_by", issue: { identifier: "ENG-1" } }]);

    // Adding it from the other side is the same relation.
    const again = await owner.post(`${org}/issues/ENG-2/relations`, { type: "blocked_by", issue: "ENG-1" });
    expect(again.status).toBe(409);
    const reverse = await owner.post(`${org}/issues/ENG-2/relations`, { type: "blocks", issue: "ENG-1" });
    expect(reverse.status).toBe(400);
  });

  it("related is one link in both directions; duplicate of points one way", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await issue(owner, org, eng.id);
    await issue(owner, org, eng.id);
    await issue(owner, org, eng.id);

    expect((await owner.post(`${org}/issues/ENG-1/relations`, { type: "related", issue: "ENG-2" })).status).toBe(201);
    expect((await owner.post(`${org}/issues/ENG-2/relations`, { type: "related", issue: "ENG-1" })).status).toBe(409);
    expect((await owner.get(`${org}/issues/ENG-2/relations`)).body).toMatchObject([
      { type: "related", issue: { identifier: "ENG-1" } },
    ]);

    expect((await owner.post(`${org}/issues/ENG-3/relations`, { type: "duplicate_of", issue: "ENG-1" })).status).toBe(201);
    expect((await owner.get(`${org}/issues/ENG-1/relations`)).body.map((r: { type: string }) => r.type).sort()).toEqual([
      "duplicated_by",
      "related",
    ]);
    expect((await owner.post(`${org}/issues/ENG-1/relations`, { type: "related", issue: "ENG-1" })).status).toBe(400);
  });

  it("removes a relation and records both changes in the event log", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const one = await issue(owner, org, eng.id);
    const two = await issue(owner, org, eng.id);
    const relation = (await owner.post(`${org}/issues/ENG-1/relations`, { type: "blocks", issue: "ENG-2" })).body;

    expect((await owner.delete(`${org}/issues/ENG-2/relations/${relation.id}`)).status).toBe(204);
    expect((await owner.get(`${org}/issues/ENG-1/relations`)).body).toEqual([]);

    const [removed, added] = (await owner.get(`${org}/events?limit=2`)).body;
    expect(added).toMatchObject({ type: "relation.created", subjectId: relation.id, data: { type: "blocks", issueId: one.id, relatedIssueId: two.id } });
    expect(removed).toMatchObject({ type: "relation.deleted", subjectId: relation.id });
  });

  it("hides relations to issues in teams the caller cannot see", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const sec = await createTeam(owner, org, "SEC", { private: true });
    await issue(owner, org, eng.id);
    await issue(owner, org, sec.id);
    await owner.post(`${org}/issues/ENG-1/relations`, { type: "related", issue: "SEC-1" });
    const { client: mia } = await join(t.baseUrl, owner, org, "Mia", "member");

    expect((await mia.get(`${org}/issues/ENG-1/relations`)).body).toEqual([]);
    expect((await mia.post(`${org}/issues/ENG-1/relations`, { type: "related", issue: "SEC-1" })).status).toBe(404);
  });
});

describe("moving an issue to another team", () => {
  it("gives it the next number there, keeps the old identifier resolving, and maps its status", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const ops = await createTeam(owner, org, "OPS");
    await issue(owner, org, ops.id);
    const engStatuses = (await owner.get(`${org}/teams/${eng.id}/statuses`)).body as { id: string; name: string }[];
    const opsStatuses = (await owner.get(`${org}/teams/${ops.id}/statuses`)).body as { id: string; name: string }[];
    const review = engStatuses.find((s) => s.name === "In Review")!;
    const moving = await issue(owner, org, eng.id, { statusId: review.id });

    const res = await owner.patch(`${org}/issues/ENG-1`, { version: 1, teamId: ops.id });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: moving.id,
      identifier: "OPS-2",
      teamId: ops.id,
      statusId: opsStatuses.find((s) => s.name === "In Review")!.id,
      version: 2,
    });
    const [event] = (await owner.get(`${org}/events?limit=1`)).body;
    expect(event.data.changes).toMatchObject({
      teamId: { from: eng.id, to: ops.id },
      identifier: { from: "ENG-1", to: "OPS-2" },
    });

    expect((await owner.get(`${org}/issues/ENG-1`)).body.identifier).toBe("OPS-2");
    expect((await owner.get(`${org}/teams/${eng.id}/issues`)).body).toEqual([]);

    // The old number stays taken in ENG.
    expect((await issue(owner, org, eng.id)).identifier).toBe("ENG-2");
  });

  it("falls back to a status of the same category, and drops the old team's labels", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const ops = await createTeam(owner, org, "OPS");
    const engStatuses = (await owner.get(`${org}/teams/${eng.id}/statuses`)).body as { id: string; name: string }[];
    const opsStatuses = (await owner.get(`${org}/teams/${ops.id}/statuses`)).body as { id: string; name: string }[];
    const qa = (await owner.post(`${org}/teams/${eng.id}/statuses`, { name: "QA", category: "in_progress" })).body;
    const bug = (await owner.post(`${org}/labels`, { name: "Bug", hue: 25 })).body;
    const web = (await owner.post(`${org}/teams/${eng.id}/labels`, { name: "web", hue: 230 })).body;
    await issue(owner, org, eng.id, { statusId: qa.id, labelIds: [bug.id, web.id] });
    expect(engStatuses.length).toBe(6);

    const res = await owner.patch(`${org}/issues/ENG-1`, { version: 1, teamId: ops.id });
    expect(res.status).toBe(200);
    expect(res.body.statusId).toBe(opsStatuses.find((s) => s.name === "In Progress")!.id);
    expect(res.body.labelIds).toEqual([bug.id]);
  });

  it("takes a status, labels and assignee for the new team in the same request", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const sec = await createTeam(owner, org, "SEC", { private: true });
    const { memberId: mia } = await join(t.baseUrl, owner, org, "Mia", "member", [eng.id]);
    await issue(owner, org, eng.id, { assigneeId: mia });
    const secStatuses = (await owner.get(`${org}/teams/${sec.id}/statuses`)).body as { id: string; name: string }[];
    const done = secStatuses.find((s) => s.name === "Done")!;

    // Mia cannot see SEC, so she cannot stay the assignee.
    const refused = await owner.patch(`${org}/issues/ENG-1`, { version: 1, teamId: sec.id });
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toMatch(/assignee/i);

    const moved = await owner.patch(`${org}/issues/ENG-1`, { version: 1, teamId: sec.id, statusId: done.id, assigneeId: null });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ identifier: "SEC-1", statusId: done.id, assigneeId: null });
  });

  it("needs to see the team it moves to", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const sec = await createTeam(owner, org, "SEC", { private: true });
    const { client: mia } = await join(t.baseUrl, owner, org, "Mia", "member", [eng.id]);
    await issue(mia, org, eng.id);

    expect((await mia.patch(`${org}/issues/ENG-1`, { version: 1, teamId: sec.id })).status).toBe(400);
  });
});
