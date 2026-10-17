import { describe, expect, it } from "vitest";
import { createTeam, join, orgWithOwner } from "./org.js";
import { startTestServer, apiClient, signUpAs, type ApiClient } from "./server.js";

async function issue(client: ApiClient, org: string, teamId: string, body: Record<string, unknown> = {}) {
  const res = await client.post(`${org}/teams/${teamId}/issues`, { title: "An issue", ...body });
  expect(res.status).toBe(201);
  return res.body as { id: string; identifier: string; version: number };
}

function form(name: string, type: string, content: string): FormData {
  const data = new FormData();
  data.append("file", new Blob([content], { type }), name);
  return data;
}

describe("attachments", () => {
  it("uploads a file, lists it, and serves it at its /files path", async () => {
    const t = await startTestServer();
    const { owner, ownerId, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const one = await issue(owner, org, eng.id);

    const res = await owner.postForm(`${org}/issues/${one.identifier}/attachments`, form("spec.md", "text/markdown", "# The spec"));
    expect(res.status).toBe(201);
    const attachment = res.body as { id: string; issueId: string; name: string; path: string; contentType: string; sizeBytes: number; creatorId: string };
    expect(attachment).toMatchObject({
      issueId: one.id,
      name: "spec.md",
      path: `/files/${attachment.id}/spec.md`,
      contentType: "text/markdown",
      sizeBytes: "# The spec".length,
      creatorId: ownerId,
    });

    const list = (await owner.get(`${org}/issues/ENG-1/attachments`)).body;
    expect(list).toMatchObject([{ id: attachment.id, path: attachment.path }]);

    const file = await fetch(`${t.baseUrl}${attachment.path}`, { headers: { cookie: owner.cookie } });
    expect(file.status).toBe(200);
    expect(await file.text()).toBe("# The spec");
    expect(file.headers.get("content-type")).toContain("text/markdown");
    expect(new URL(file.url).pathname).toBe(attachment.path);

    // Descriptions and comments point at it with a relative link (ADR 0020).
    await owner.patch(`${org}/issues/ENG-1`, { version: one.version, description: `See [the spec](${attachment.path}).` });
    const described = (await owner.get(`${org}/issues/ENG-1`)).body;
    expect(described.description).toContain(attachment.path);
  });

  it("logs the change in the event log", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await issue(owner, org, eng.id);
    const created = (await owner.get(`${org}/issues/ENG-1/attachments`)).body;
    expect(created).toEqual([]);
    const attachment = (await owner.postForm(`${org}/issues/ENG-1/attachments`, form("note.txt", "text/plain", "hello"))).body;
    const [event] = (await owner.get(`${org}/events?limit=1`)).body;
    expect(event).toMatchObject({ type: "attachment.created", subjectId: attachment.id, data: { issueId: attachment.issueId, name: "note.txt" } });
  });

  it("refuses a file bigger than the configured limit", async () => {
    const t = await startTestServer({ maxAttachmentBytes: 8 });
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await issue(owner, org, eng.id);

    const res = await owner.postForm(`${org}/issues/ENG-1/attachments`, form("big.txt", "text/plain", "more than eight"));
    expect(res.status).toBe(413);
    expect(res.body.error).toMatchObject({ code: "too_large" });
    expect((await owner.get(`${org}/issues/ENG-1/attachments`)).body).toEqual([]);
  });

  it("only shows and serves a file to callers who can see the issue", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const sec = await createTeam(owner, org, "SEC", { private: true });
    await issue(owner, org, eng.id);
    const secret = await issue(owner, org, sec.id);
    const hidden = (await owner.postForm(`${org}/issues/${secret.identifier}/attachments`, form("secret.txt", "text/plain", "classified"))).body;
    const { client: mia } = await join(t.baseUrl, owner, org, "Mia", "member", [eng.id]);

    expect((await mia.get(`${org}/issues/${secret.identifier}/attachments`)).status).toBe(404);
    const noAccess = await fetch(`${t.baseUrl}${hidden.path}`, { headers: { cookie: mia.cookie } });
    expect(noAccess.status).toBe(404);
    const nobody = await fetch(`${t.baseUrl}${hidden.path}`);
    expect(nobody.status).toBe(401);
    const poached = (await owner.get(`${org}/issues/ENG-1/attachments`)).body;
    expect(poached).toEqual([]);
  });

  it("keeps odd file names, content types and unknown paths safe", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await issue(owner, org, eng.id);

    const res = await owner.postForm(`${org}/issues/ENG-1/attachments`, form("weird name/../shot.png", "image/png", "notapng"));
    expect(res.status).toBe(201);
    const attachment = res.body as { name: string; path: string };
    expect(attachment.name).not.toContain("/");
    expect(attachment.name).not.toContain("..");

    const unknown = await fetch(`${t.baseUrl}/files/00000000-0000-0000-0000-000000000000/thing.txt`, { headers: { cookie: owner.cookie } });
    expect(unknown.status).toBe(404);
    const notAnId = await fetch(`${t.baseUrl}/files/not-an-id/thing.txt`, { headers: { cookie: owner.cookie } });
    expect(notAnId.status).toBe(404);

    // A name with URL syntax in it still links to itself.
    const odd = (await owner.postForm(`${org}/issues/ENG-1/attachments`, form("what?#1.txt", "text/plain", "odd"))).body;
    const fetched = await fetch(`${t.baseUrl}${odd.path}`, { headers: { cookie: owner.cookie } });
    expect(await fetched.text()).toBe("odd");
  });

  it("never lets an uploaded file run as the instance", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await issue(owner, org, eng.id);
    const upload = async (name: string, type: string, content: string) =>
      (await owner.postForm(`${org}/issues/ENG-1/attachments`, form(name, type, content))).body as { path: string };
    const get = (path: string) => fetch(`${t.baseUrl}${path}`, { headers: { cookie: owner.cookie } });

    const page = await get((await upload("x.html", "text/html", "<script>alert(1)</script>")).path);
    expect(page.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(page.headers.get("x-content-type-options")).toBe("nosniff");
    expect(page.headers.get("content-security-policy")).toContain("sandbox");
    const svg = await get((await upload("x.svg", "image/svg+xml", "<svg onload='alert(1)'/>")).path);
    expect(svg.headers.get("content-disposition")).toMatch(/^attachment;/);

    const png = await get((await upload("shot.png", "image/png", "notapng")).path);
    expect(png.headers.get("content-disposition")).toMatch(/^inline;/);
    expect(png.headers.get("content-security-policy")).toContain("sandbox");
  });

  it("refuses an oversized upload before reading it", async () => {
    const t = await startTestServer({ maxAttachmentBytes: 8 });
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await issue(owner, org, eng.id);

    const res = await owner.postForm(`${org}/issues/ENG-1/attachments`, form("big.txt", "text/plain", "x".repeat(200 * 1024)));
    expect(res.status).toBe(413);
    expect(res.body.error).toMatchObject({ code: "too_large" });
  });

  it("needs a sign-in to upload", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await issue(owner, org, eng.id);
    const nobody = apiClient(t.baseUrl);
    expect((await nobody.postForm(`${org}/issues/ENG-1/attachments`, form("x.txt", "text/plain", "hi"))).status).toBe(401);
    const stranger = await signUpAs(t.baseUrl, "Stranger");
    expect((await stranger.postForm(`${org}/issues/ENG-1/attachments`, form("x.txt", "text/plain", "hi"))).status).toBe(404);
  });
});
