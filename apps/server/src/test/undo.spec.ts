import { describe, expect, it } from "vitest";
import { createTeam, join, orgWithOwner } from "./org.js";
import { startTestServer, type ApiClient, type ApiResponse } from "./server.js";

async function issue(client: ApiClient, org: string, teamId: string, body: Record<string, unknown> = {}) {
  const res = await client.post(`${org}/teams/${teamId}/issues`, { title: "An issue", ...body });
  expect(res.status).toBe(201);
  return res.body as { id: string; identifier: string; version: number; statusId: string };
}

const changeOf = (res: ApiResponse) => {
  const id = res.headers.get("edict-change-id");
  expect(id).toBeTruthy();
  return id!;
};

async function undo(client: ApiClient, org: string, changeId: string) {
  return client.post(`${org}/changes/${changeId}/undo`);
}

describe("undo", () => {
  it("sets edited fields back, and undoing the undo redoes them", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const before = await issue(owner, org, eng.id, { title: "Before", priority: "low" });
    const label = (await owner.post(`${org}/labels`, { name: "bug" })).body;

    const edit = await owner.patch(`${org}/issues/ENG-1`, {
      version: before.version,
      title: "After",
      priority: "urgent",
      labelIds: [label.id],
    });
    expect(edit.status).toBe(200);

    const undone = await undo(owner, org, changeOf(edit));
    expect(undone.status).toBe(200);
    expect(undone.body.undoes).toBe(changeOf(edit));
    expect(undone.body.changeId).toBe(changeOf(undone));
    expect((await owner.get(`${org}/issues/ENG-1`)).body).toMatchObject({ title: "Before", priority: "low", labelIds: [] });
    const [event] = (await owner.get(`${org}/events?limit=1`)).body;
    expect(event).toMatchObject({ type: "issue.updated", data: { undoes: changeOf(edit) } });

    const redone = await undo(owner, org, undone.body.changeId);
    expect(redone.status).toBe(200);
    expect((await owner.get(`${org}/issues/ENG-1`)).body).toMatchObject({
      title: "After",
      priority: "urgent",
      labelIds: [label.id],
    });
  });

  it("refuses with 409 and changes nothing when a field changed since", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const one = await issue(owner, org, eng.id, { title: "Before" });
    const edit = await owner.patch(`${org}/issues/ENG-1`, { version: one.version, title: "Mine", priority: "high" });
    // Someone else changes the priority afterwards; the title is untouched.
    const { client: mia } = await join(t.baseUrl, owner, org, "Mia", "member", [eng.id]);
    await mia.patch(`${org}/issues/ENG-1`, { version: edit.body.version, priority: "low" });

    const res = await undo(owner, org, changeOf(edit));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: "conflict", fields: ["priority"] });
    expect((await owner.get(`${org}/issues/ENG-1`)).body).toMatchObject({ title: "Mine", priority: "low" });
  });

  it("trashes a created issue, and restores it on redo", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const created = await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Oops" });

    const undone = await undo(owner, org, changeOf(created));
    expect(undone.status).toBe(200);
    expect((await owner.get(`${org}/issues/ENG-1`)).status).toBe(410);

    expect((await undo(owner, org, undone.body.changeId)).status).toBe(200);
    expect((await owner.get(`${org}/issues/ENG-1`)).status).toBe(200);
  });

  it("restores a deleted issue with its sub-issues", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const parent = await issue(owner, org, eng.id);
    await issue(owner, org, eng.id, { parentId: parent.id });
    const deleted = await owner.delete(`${org}/issues/ENG-1`);

    expect((await undo(owner, org, changeOf(deleted))).status).toBe(200);
    expect((await owner.get(`${org}/issues/ENG-1/sub-issues`)).body).toHaveLength(1);
    expect((await owner.get(`${org}/trash`)).body).toEqual([]);

    // Once it is back, the delete has nothing left to undo.
    expect((await undo(owner, org, changeOf(deleted))).status).toBe(409);
  });

  it("moves an issue back to its old team and identifier", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const ops = await createTeam(owner, org, "OPS");
    const one = await issue(owner, org, eng.id);
    const moved = await owner.patch(`${org}/issues/ENG-1`, { version: one.version, teamId: ops.id });
    expect(moved.body.identifier).toBe("OPS-1");

    expect((await undo(owner, org, changeOf(moved))).status).toBe(200);
    const back = (await owner.get(`${org}/issues/OPS-1`)).body;
    expect(back).toMatchObject({ identifier: "ENG-1", teamId: eng.id, statusId: one.statusId });
  });

  it("undoes comments: posting, editing and deleting", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await issue(owner, org, eng.id);
    const bodies = async () => (await owner.get(`${org}/issues/ENG-1/comments`)).body.map((c: { body: string }) => c.body);

    const posted = await owner.post(`${org}/issues/ENG-1/comments`, { body: "First" });
    const edited = await owner.patch(`${org}/comments/${posted.body.id}`, { version: 1, body: "Second" });
    expect((await undo(owner, org, changeOf(edited))).status).toBe(200);
    expect(await bodies()).toEqual(["First"]);

    const deleted = await owner.delete(`${org}/comments/${posted.body.id}`);
    expect(await bodies()).toEqual([]);
    expect((await undo(owner, org, changeOf(deleted))).status).toBe(200);
    expect(await bodies()).toEqual(["First"]);

    expect((await undo(owner, org, changeOf(posted))).status).toBe(200);
    expect(await bodies()).toEqual([]);
  });

  it("undoes adding and removing a relation", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await issue(owner, org, eng.id);
    await issue(owner, org, eng.id);
    const relations = async () => (await owner.get(`${org}/issues/ENG-1/relations`)).body;

    const added = await owner.post(`${org}/issues/ENG-1/relations`, { type: "blocks", issue: "ENG-2" });
    const removed = await owner.delete(`${org}/issues/ENG-1/relations/${added.body.id}`);
    expect(await relations()).toEqual([]);
    expect((await undo(owner, org, changeOf(removed))).status).toBe(200);
    expect(await relations()).toMatchObject([{ id: added.body.id, type: "blocks" }]);
    expect((await undo(owner, org, changeOf(added))).status).toBe(200);
    expect(await relations()).toEqual([]);
  });

  it("lets only the change's actor undo it, and says what it cannot undo", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const created = await owner.post(`${org}/teams`, { name: "Eng", key: "ENG" });
    const edit = await owner.post(`${org}/teams/${created.body.id}/issues`, { title: "Mine" });
    const { client: mia } = await join(t.baseUrl, owner, org, "Mia", "member", [created.body.id]);

    expect((await undo(mia, org, changeOf(edit))).status).toBe(403);
    const unsupported = await undo(owner, org, changeOf(created));
    expect(unsupported.status).toBe(400);
    expect(unsupported.body.error.message).toMatch(/team\.created/);
    expect((await undo(owner, org, "00000000-0000-7000-8000-000000000000")).status).toBe(404);
  });

  it("undoes a bulk edit across multiple issues in a single undo change", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const one = await issue(owner, org, eng.id, { title: "Issue 1", priority: "low" });
    const two = await issue(owner, org, eng.id, { title: "Issue 2", priority: "medium" });

    const bulk = await owner.post(`${org}/issues/bulk-update`, {
      issues: [
        { id: one.id, version: one.version },
        { id: two.id, version: two.version },
      ],
      priority: "urgent",
    });
    expect(bulk.status).toBe(200);

    const firstAfter = (await owner.get(`${org}/issues/${one.identifier}`)).body;
    const secondAfter = (await owner.get(`${org}/issues/${two.identifier}`)).body;
    expect(firstAfter.priority).toBe("urgent");
    expect(secondAfter.priority).toBe("urgent");

    const undone = await undo(owner, org, changeOf(bulk));
    expect(undone.status).toBe(200);

    const firstUndone = (await owner.get(`${org}/issues/${one.identifier}`)).body;
    const secondUndone = (await owner.get(`${org}/issues/${two.identifier}`)).body;
    expect(firstUndone.priority).toBe("low");
    expect(secondUndone.priority).toBe("medium");
  });

  it("undoes a bulk delete, bringing back all trashed issues together", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const one = await issue(owner, org, eng.id, { title: "Issue 1" });
    const two = await issue(owner, org, eng.id, { title: "Issue 2" });

    const bulkDel = await owner.post(`${org}/issues/bulk-delete`, {
      issueIds: [one.id, two.id],
    });
    expect(bulkDel.status).toBe(204);

    expect((await owner.get(`${org}/issues/${one.identifier}`)).status).toBe(410);
    expect((await owner.get(`${org}/issues/${two.identifier}`)).status).toBe(410);

    const undone = await undo(owner, org, changeOf(bulkDel));
    expect(undone.status).toBe(200);

    expect((await owner.get(`${org}/issues/${one.identifier}`)).status).toBe(200);
    expect((await owner.get(`${org}/issues/${two.identifier}`)).status).toBe(200);
  });
});
