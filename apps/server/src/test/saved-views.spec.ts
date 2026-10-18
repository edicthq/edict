import { describe, expect, it } from "vitest";
import { createTeam, join, orgWithOwner } from "./org.js";
import { startTestServer } from "./server.js";

type SavedView = {
  id: string;
  teamId: string;
  memberId: string;
  name: string;
  query: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
};

describe("saved views", () => {
  it("a member keeps the URL's view and reads it back", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");

    const query = { q: "chart", statuses: ["Todo"], priorities: ["urgent"], groupBy: "priority", sortBy: "updated", dir: "desc" };
    const created = await owner.post(`${org}/teams/${eng.id}/saved-views`, { name: "Urgent now", query });
    expect(created.status).toBe(201);
    const view = created.body as SavedView;
    expect(view.name).toBe("Urgent now");
    expect(view.query).toEqual(query);
    expect(view.version).toBe(1);

    const list = await owner.get(`${org}/teams/${eng.id}/saved-views`);
    expect(list.status).toBe(200);
    expect(list.body.map((v: SavedView) => v.name)).toEqual(["Urgent now"]);

    // Empty views list for a member with none.
    const { client: peer } = await join(t.baseUrl, owner, org, "Peer", "member", [eng.id]);
    const peerList = await peer.get(`${org}/teams/${eng.id}/saved-views`);
    expect(peerList.status).toBe(200);
    expect(peerList.body).toEqual([]);
    // And a peer cannot even read the owner's view by id.
    expect((await peer.get(`${org}/teams/${eng.id}/saved-views/${view.id}`)).status).toBe(403);
  });

  it("views names repeat across members and teams, but not for one member on one team", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const art = await createTeam(owner, org, "ART");

    await owner.post(`${org}/teams/${eng.id}/saved-views`, { name: "Mine", query: {} });
    expect((await owner.post(`${org}/teams/${eng.id}/saved-views`, { name: "Mine", query: {} })).status).toBe(400);
    expect((await owner.post(`${org}/teams/${eng.id}/saved-views`, { name: "Mine", query: {} })).body).toEqual({
      error: { code: "invalid_request", message: "You already have a view with this name." },
    });
    // Another team of the same member may reuse the name.
    expect((await owner.post(`${org}/teams/${art.id}/saved-views`, { name: "Mine", query: { groupBy: "assignee" } })).status).toBe(201);
  });

  it("a stale update fails with a conflict", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const created = (await (
      await owner.post(`${org}/teams/${eng.id}/saved-views`, { name: "Bugs", query: { q: "bug" } })
    ).body) as SavedView;

    const renamed = await owner.patch(`${org}/teams/${eng.id}/saved-views/${created.id}`, {
      version: created.version,
      name: "Bugs to fix",
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("Bugs to fix");
    expect(renamed.body.version).toBe(2);

    // The old version no longer renames.
    const stale = await owner.patch(`${org}/teams/${eng.id}/saved-views/${created.id}`, {
      version: created.version,
      name: "Bugs again",
    });
    expect(stale.status).toBe(409);
  });

  it("deleting a view is immediate and leaves other views alone", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const first = (await (
      await owner.post(`${org}/teams/${eng.id}/saved-views`, { name: "Keep", query: {} })
    ).body) as SavedView;
    const second = (await (
      await owner.post(`${org}/teams/${eng.id}/saved-views`, { name: "Drop", query: {} })
    ).body) as SavedView;

    expect((await owner.delete(`${org}/teams/${eng.id}/saved-views/${second.id}`)).status).toBe(204);
    expect((await owner.get(`${org}/teams/${eng.id}/saved-views/${second.id}`)).status).toBe(404);
    const list = (await (await owner.get(`${org}/teams/${eng.id}/saved-views`)).body) as SavedView[];
    expect(list.map((v) => v.name)).toEqual(["Keep"]);

    // The name is free again after deleting.
    expect((await owner.post(`${org}/teams/${eng.id}/saved-views`, { name: "Drop", query: {} })).status).toBe(201);
    void first;
  });
});
