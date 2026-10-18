import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createTeam, join, orgWithOwner } from "./org.js";
import { startTestServer } from "./server.js";

const form = (name: string, type: string, content: string) => {
  const data = new FormData();
  data.append("file", new Blob([content], { type }), name);
  return data;
};

describe("export", () => {
  it("zips the organization with its members, teams and issues", async () => {
    const t = await startTestServer();
    const { owner, org, ownerId, orgId } = await orgWithOwner(t.baseUrl);
    const { client: dev, memberId: devId } = await join(t.baseUrl, owner, org, "Dev", "member");
    const eng = await createTeam(owner, org, "ENG");
    await owner.post(`${org}/teams/${eng.id}/members`, { memberId: devId });
    const label = (await owner.post(`${org}/teams/${eng.id}/labels`, { name: "Backend" })).body;
    const project = (await owner.post(`${org}/projects`, { name: "Launch" })).body;
    const template = (await owner.post(`${org}/teams/${eng.id}/templates`, { name: "Bug report", title: "Bug: " })).body;
    const view = (await owner.post(`${org}/teams/${eng.id}/saved-views`, { name: "Mine", query: { priorities: ["urgent"] } })).body;
    const one = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "First", labelIds: [label.id], projectId: project.id })).body as { id: string };
    await owner.post(`${org}/issues/ENG-1/comments`, { body: "Hello" });
    const two = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Second" })).body;
    await owner.post(`${org}/issues/ENG-1/relations`, { type: "blocks", issue: two.identifier });
    await owner.post(`${org}/issues/ENG-1/links`, { url: "https://example.com/pr", title: "The PR" });
    await dev.postForm(`${org}/issues/ENG-1/attachments`, form("spec.md", "text/markdown", "# The spec"));
    await owner.post(`${org}/webhooks`, { url: "https://example.com/hook" });

    const res = await fetch(`${t.baseUrl}/api/v1${org}/export`, { headers: { cookie: owner.cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/zip");
    expect(res.headers.get("content-disposition")).toContain("acme-edict-export.zip");

    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    const document = JSON.parse(await zip.file("edict-export.json")!.async("text"));

    expect(document.format).toBe("edict-export");
    expect(document.version).toBe(1);
    expect(document.organization).toMatchObject({ id: orgId, name: "Acme", slug: "acme" });
    expect(document.members).toEqual([
      expect.objectContaining({ id: ownerId, role: "owner", email: expect.stringContaining("@") }),
      expect.objectContaining({ role: "member", email: expect.stringContaining("@") }),
    ]);
    expect(document.teams).toEqual([expect.objectContaining({ key: "ENG", name: "ENG" })]);
    expect(document.statuses.map((s: { category: string }) => s.category)).toEqual(
      expect.arrayContaining(["backlog", "todo", "in_progress", "done", "canceled"]),
    );
    expect(document.labels).toEqual([expect.objectContaining({ name: "Backend" })]);
    expect(document.projects).toEqual([expect.objectContaining({ id: project.id, name: "Launch" })]);
    expect(document.templates).toEqual([expect.objectContaining({ id: template.id, name: "Bug report" })]);
    expect(document.savedViews).toEqual([expect.objectContaining({ id: view.id, memberId: ownerId })]);
    expect(document.issues.map((i: { number: number }) => i.number)).toEqual([1, 2]);
    expect(document.issues[0]).toMatchObject({ title: "First", projectId: project.id });
    expect(document.issues).toHaveLength(2);
    expect(document.comments).toEqual([expect.objectContaining({ body: "Hello" })]);
    expect(document.issueRelations).toEqual([expect.objectContaining({ type: "blocks" })]);
    expect(document.issueLinks).toEqual([expect.objectContaining({ url: "https://example.com/pr" })]);
    expect(document.issueLabels).toHaveLength(1);
    expect(document.progressUpdates).toEqual([]);
    // The signing secret is not serialized, so the zip cannot read it.
    expect(document.webhooks).toEqual([expect.objectContaining({ url: "https://example.com/hook" })]);
    expect(JSON.stringify(document.webhooks)).not.toContain("secret");
  });

  it("carries attachment bytes under the attachment's id", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await owner.post(`${org}/teams/${eng.id}/issues`, { title: "First" });
    const created = (await owner.postForm(`${org}/issues/ENG-1/attachments`, form("spec.md", "text/markdown", "# The spec"))).body;

    const res = await fetch(`${t.baseUrl}/api/v1${org}/export`, { headers: { cookie: owner.cookie } });
    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    expect(await zip.file(`attachments/${created.id}/spec.md`)!.async("text")).toBe("# The spec");
  });

  it("is for owners and admins", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const { client: member } = await join(t.baseUrl, owner, org, "Member", "member");
    const eng = await createTeam(owner, org, "ENG");
    const { client: guest } = await join(t.baseUrl, owner, org, "Guest", "guest", [eng.id]);

    await member.get(`${org}/export`).then((r) => expect(r.status).toBe(403));
    await guest.get(`${org}/export`).then((r) => expect(r.status).toBe(403));
    expect(
      (await fetch(`${t.baseUrl}/api/v1${org}/export`, { headers: { cookie: owner.cookie } })).status,
    ).toBe(200);
  });

  it("an anonymous caller gets 401, not a copy", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const res = await fetch(`${t.baseUrl}/api/v1${org}/export`);
    expect(res.status).toBe(401);
  });
});
