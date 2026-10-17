import { describe, expect, it } from "vitest";
import { createTeam, join, orgWithOwner } from "./org.js";
import { startTestServer } from "./server.js";

type Label = { id: string; name: string; hue: number; teamId: string | null; version: number };

describe("labels", () => {
  it("an organization label works in every team; a team label only in its own", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const ops = await createTeam(owner, org, "OPS");

    const bug = await owner.post(`${org}/labels`, { name: "Bug", hue: 25 });
    expect(bug.status).toBe(201);
    expect(bug.body).toMatchObject({ name: "Bug", hue: 25, teamId: null, version: 1 });
    const db = await owner.post(`${org}/teams/${eng.id}/labels`, { name: "db", hue: 140 });
    expect(db.status).toBe(201);
    expect(db.body).toMatchObject({ name: "db", teamId: eng.id });

    const names = (res: { body: Label[] }) => res.body.map((l) => l.name);
    expect(names(await owner.get(`${org}/labels`))).toEqual(["Bug"]);
    expect(names(await owner.get(`${org}/teams/${eng.id}/labels`))).toEqual(["Bug", "db"]);
    expect(names(await owner.get(`${org}/teams/${ops.id}/labels`))).toEqual(["Bug"]);

    const issue = await owner.post(`${org}/teams/${eng.id}/issues`, { title: "x", labelIds: [bug.body.id, db.body.id] });
    expect(issue.status).toBe(201);
    expect(issue.body.labelIds.sort()).toEqual([bug.body.id, db.body.id].sort());

    const wrongTeam = await owner.post(`${org}/teams/${ops.id}/issues`, { title: "x", labelIds: [db.body.id] });
    expect(wrongTeam.status).toBe(400);
    expect(wrongTeam.body.error.message).toMatch(/label/i);
  });

  it("one name means one label: no duplicates, and no team label shadowing an organization label", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const ops = await createTeam(owner, org, "OPS");
    await owner.post(`${org}/labels`, { name: "Bug", hue: 25 });
    await owner.post(`${org}/teams/${eng.id}/labels`, { name: "db", hue: 140 });

    expect((await owner.post(`${org}/labels`, { name: "bug", hue: 1 })).status).toBe(409);
    expect((await owner.post(`${org}/teams/${eng.id}/labels`, { name: "BUG", hue: 1 })).status).toBe(409);
    expect((await owner.post(`${org}/teams/${eng.id}/labels`, { name: "DB", hue: 1 })).status).toBe(409);
    // Another team can have its own "db"...
    expect((await owner.post(`${org}/teams/${ops.id}/labels`, { name: "db", hue: 1 })).status).toBe(201);
    // ...but then no organization label can take that name.
    expect((await owner.post(`${org}/labels`, { name: "db", hue: 1 })).status).toBe(409);
  });

  it("admins manage organization labels; members manage their teams' labels; guests neither", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const { client: member } = await join(t.baseUrl, owner, org, "Mia", "member", [eng.id]);
    const { client: guest } = await join(t.baseUrl, owner, org, "Gus", "guest", [eng.id]);

    expect((await member.post(`${org}/labels`, { name: "Bug", hue: 25 })).status).toBe(403);
    expect((await member.post(`${org}/teams/${eng.id}/labels`, { name: "web", hue: 230 })).status).toBe(201);
    expect((await guest.post(`${org}/teams/${eng.id}/labels`, { name: "api", hue: 60 })).status).toBe(403);
  });

  it("renames and recolors a label at its current version", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const label = (await owner.post(`${org}/labels`, { name: "Bug", hue: 25 })).body as Label;

    const res = await owner.patch(`${org}/labels/${label.id}`, { version: 1, name: "Defect", hue: 10 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Defect", hue: 10, version: 2 });
    expect((await owner.patch(`${org}/labels/${label.id}`, { version: 1, name: "Stale" })).status).toBe(409);
  });

  it("deleting a label takes it off its issues, as a change to each issue", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const bug = (await owner.post(`${org}/labels`, { name: "Bug", hue: 25 })).body as Label;
    await owner.post(`${org}/teams/${eng.id}/issues`, { title: "x", labelIds: [bug.id] });

    expect((await owner.delete(`${org}/labels/${bug.id}`)).status).toBe(204);
    const issue = (await owner.get(`${org}/issues/ENG-1`)).body;
    expect(issue).toMatchObject({ labelIds: [], version: 2 });
    expect((await owner.get(`${org}/labels`)).body).toEqual([]);
  });

  it("an update replaces the label set and records what was added and removed", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const bug = (await owner.post(`${org}/labels`, { name: "Bug", hue: 25 })).body as Label;
    const web = (await owner.post(`${org}/teams/${eng.id}/labels`, { name: "web", hue: 230 })).body as Label;
    await owner.post(`${org}/teams/${eng.id}/issues`, { title: "x", labelIds: [bug.id] });

    const res = await owner.patch(`${org}/issues/ENG-1`, { version: 1, labelIds: [web.id] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ labelIds: [web.id], version: 2 });
    const [event] = (await owner.get(`${org}/events?limit=1`)).body;
    expect(event.data.changes.labelIds).toEqual({ from: [bug.id], to: [web.id] });

    // The same set in another order is no change.
    const same = await owner.patch(`${org}/issues/ENG-1`, { version: 2, labelIds: [web.id] });
    expect(same.body.version).toBe(2);
  });
});
