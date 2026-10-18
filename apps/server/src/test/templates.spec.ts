import { describe, expect, it } from "vitest";
import { createTeam, join, orgWithOwner } from "./org.js";
import { startTestServer } from "./server.js";

type Template = {
  id: string;
  teamId: string;
  name: string;
  title: string;
  description: string;
  labelIds: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
};

describe("team templates", () => {
  it("a member creates a template, reads it back, changes it and deleting removes it", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");

    const created = await owner.post(`${org}/teams/${eng.id}/templates`, {
      name: "Bug report",
      title: "Fix: ",
      description: "## What happened\n\n\n## Steps to reproduce\n",
    });
    expect(created.status).toBe(201);
    const template = created.body as Template;
    expect(template.teamId).toBe(eng.id);
    expect(template.title).toBe("Fix:");
    expect(template.labelIds).toEqual([]);
    expect(template.version).toBe(1);

    const list = await owner.get(`${org}/teams/${eng.id}/templates`);
    expect(list.status).toBe(200);
    expect((list.body as Template[]).map((item) => item.name)).toEqual(["Bug report"]);

    // Every member of the team reads templates.
    const { client: peer } = await join(t.baseUrl, owner, org, "Peer", "member", [eng.id]);
    expect((await peer.get(`${org}/teams/${eng.id}/templates/${template.id}`)).status).toBe(200);

    // Editing carries the version; a stale edit conflicts.
    const change = await owner.patch(`${org}/teams/${eng.id}/templates/${template.id}`, {
      version: template.version,
      description: "## What happened\n\n\n## Steps to reproduce\n\n1. ",
    });
    expect(change.status).toBe(200);
    const changed = change.body as Template;
    expect(changed.version).toBe(2);

    const stale = await owner.patch(`${org}/teams/${eng.id}/templates/${template.id}`, {
      version: template.version,
      name: "Renamed",
    });
    expect(stale.status).toBe(409);

    expect((await owner.delete(`${org}/teams/${eng.id}/templates/${changed.id}`)).status).toBe(204);
    const after = await owner.get(`${org}/teams/${eng.id}/templates`);
    expect(after.body).toEqual([]);
  });

  it("names repeat across teams but not within one team", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const art = await createTeam(owner, org, "ART");

    await owner.post(`${org}/teams/${eng.id}/templates`, { name: "Report" });
    expect((await owner.post(`${org}/teams/${eng.id}/templates`, { name: "Report" })).status).toBe(400);
    expect((await owner.post(`${org}/teams/${eng.id}/templates`, { name: "Report" })).body).toEqual({
      error: { code: "invalid_request", message: "This team already has a template with this name." },
    });
    expect((await owner.post(`${org}/teams/${art.id}/templates`, { name: "Report" })).status).toBe(201);
  });

  it("templates may hold the team's labels, and rejects labels of another team", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const label = (await owner.post(`${org}/labels`, { name: "Bug" })).body as { id: string };

    const created = await owner.post(`${org}/teams/${eng.id}/templates`, {
      name: "Bug report",
      title: "Fix: ",
      description: "## What happened",
      labelIds: [label.id],
    });
    expect(created.status).toBe(201);
    expect((created.body as Template).labelIds).toEqual([label.id]);

    // A label of a different team is rejected.
    const art = await createTeam(owner, org, "ART");
    const teamLabel = (await owner.post(`${org}/teams/${art.id}/labels`, { name: "Artwork" })).body as { id: string };
    const clash = await owner.post(`${org}/teams/${eng.id}/templates`, {
      name: "Wrong label",
      labelIds: [teamLabel.id],
    });
    expect(clash.status).toBe(400);
  });

  it("guests can read templates but not change them", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const template = (await owner.post(`${org}/teams/${eng.id}/templates`, { name: "Report" })).body as Template;
    const { client: guest } = await join(t.baseUrl, owner, org, "Visitor", "guest", [eng.id]);

    expect((await guest.get(`${org}/teams/${eng.id}/templates`)).status).toBe(200);
    const patch = await guest.patch(`${org}/teams/${eng.id}/templates/${template.id}`, {
      version: template.version,
      name: "Hijacked",
    });
    expect(patch.status).toBe(403);
    expect((await guest.post(`${org}/teams/${eng.id}/templates`, { name: "Guest note" })).status).toBe(403);
    expect((await guest.delete(`${org}/teams/${eng.id}/templates/${template.id}`)).status).toBe(403);
  });
});
