import { describe, expect, it } from "vitest";
import { createTeam, join, orgWithOwner } from "./org.js";
import { startTestServer } from "./server.js";

describe("inbox", () => {
  it("notifies a member when an issue is assigned to them", async () => {
    const t = await startTestServer();
    const { owner, ownerId, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const bob = await join(t.baseUrl, owner, org, "Bob", "member", [eng.id]);

    // Owner creates issue assigned to Bob
    const res = await owner.post(`${org}/teams/${eng.id}/issues`, {
      title: "Design login flow",
      assigneeId: bob.memberId,
    });
    expect(res.status).toBe(201);
    const issue = res.body;

    // Bob checks inbox unread count
    const countRes = await bob.client.get(`${org}/inbox/unread-count`);
    expect(countRes.status).toBe(200);
    expect(countRes.body).toEqual({ unreadCount: 1 });

    // Bob fetches inbox
    const inboxRes = await bob.client.get(`${org}/inbox`);
    expect(inboxRes.status).toBe(200);
    expect(inboxRes.body).toHaveLength(1);
    const item = inboxRes.body[0];
    expect(item).toMatchObject({
      type: "assigned",
      issue: {
        id: issue.id,
        identifier: issue.identifier,
        title: "Design login flow",
      },
      readAt: null,
    });
    expect(item.actor?.id).toBe(ownerId);

    // Owner does not have notifications in their own inbox
    const ownerInbox = await owner.get(`${org}/inbox`);
    expect(ownerInbox.body).toHaveLength(0);

    // Bob marks notification as read
    const patchRes = await bob.client.patch(`${org}/inbox/${item.id}`, { read: true });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.readAt).not.toBeNull();

    // Bob's unread inbox is now empty, but all contains the item
    const unread = await bob.client.get(`${org}/inbox?filter=unread`);
    expect(unread.body).toHaveLength(0);

    const all = await bob.client.get(`${org}/inbox?filter=all`);
    expect(all.body).toHaveLength(1);
    expect(all.body[0].readAt).not.toBeNull();
  });

  it("notifies a member when they are mentioned in a comment", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const charlie = await join(t.baseUrl, owner, org, "Charlie", "member", [eng.id]);

    // Create an unassigned issue
    const res = await owner.post(`${org}/teams/${eng.id}/issues`, {
      title: "Fix bug in search",
    });
    const issue = res.body;

    // Owner comments mentioning Charlie
    const commentRes = await owner.post(`${org}/issues/${issue.identifier}/comments`, {
      body: "Hey @Charlie, could you investigate this?",
    });
    expect(commentRes.status).toBe(201);

    // Charlie has a notification for being mentioned
    const charlieInbox = await charlie.client.get(`${org}/inbox`);
    expect(charlieInbox.status).toBe(200);
    expect(charlieInbox.body).toHaveLength(1);
    expect(charlieInbox.body[0]).toMatchObject({
      type: "mentioned",
      issue: { id: issue.id, identifier: issue.identifier },
    });

    // Mark all read
    const markRes = await charlie.client.post(`${org}/inbox/read-all`, {});
    expect(markRes.status).toBe(200);
    expect(markRes.body).toEqual({ count: 1 });

    const remaining = await charlie.client.get(`${org}/inbox/unread-count`);
    expect(remaining.body).toEqual({ unreadCount: 0 });
  });

  it("notifies an agent when an issue is delegated to them", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const agent = await owner.post(`${org}/agents`, { name: "Bot", teamIds: [eng.id] });
    expect(agent.status).toBe(201);
    const agentId = agent.body.id;

    const issueRes = await owner.post(`${org}/teams/${eng.id}/issues`, {
      title: "Write documentation",
      delegateId: agentId,
    });
    expect(issueRes.status).toBe(201);

    // Agent has an unread inbox notification
    const key = await owner.post(`${org}/agents/${agentId}/api-keys`, { name: "test-key" });
    const secret = key.body.secret as string;
    const res = await fetch(`${t.baseUrl}/api/v1${org}/inbox`, {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(res.status).toBe(200);
    const items = (await import("@edicthq/schema")).InboxItem.array().parse(await res.json());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "delegated",
      issue: { title: "Write documentation" },
    });
  });
});

describe("inbox rules", () => {
  it("notifies on assignment and delegation made by an edit or a bulk edit", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const bob = await join(t.baseUrl, owner, org, "Bob", "member", [eng.id]);
    const agent = (await owner.post(`${org}/agents`, { name: "Ferro", teamIds: [eng.id] })).body;
    const one = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "One" })).body;
    const two = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Two" })).body;

    expect((await owner.patch(`${org}/issues/${one.identifier}`, { version: 1, assigneeId: bob.memberId })).status).toBe(200);
    const bulk = await owner.post(`${org}/issues/bulk-update`, { issues: [{ id: two.id, version: 1 }], assigneeId: bob.memberId, delegateId: agent.id });
    expect(bulk.status).toBe(200);

    const items = (await bob.client.get(`${org}/inbox`)).body as { type: string; issue: { id: string } }[];
    expect(items.map((item) => [item.type, item.issue.id]).sort()).toEqual([["assigned", one.id], ["assigned", two.id]].sort());
    const key = (await owner.post(`${org}/agents/${agent.id}/api-keys`, { name: "k" })).body.secret;
    const res = await fetch(`${t.baseUrl}/api/v1${org}/inbox`, { headers: { authorization: `Bearer ${key}` } });
    expect(((await res.json()) as { type: string }[]).map((item: { type: string }) => item.type)).toEqual(["delegated"]);
  });

  it("tells the assignee when an agent posts progress or someone else moves the issue", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const bob = await join(t.baseUrl, owner, org, "Bob", "member", [eng.id]);
    const agent = (await owner.post(`${org}/agents`, { name: "Ferro", teamIds: [eng.id] })).body;
    const key = (await owner.post(`${org}/agents/${agent.id}/api-keys`, { name: "k" })).body.secret;
    const issue = (await bob.client.post(`${org}/teams/${eng.id}/issues`, { title: "Work", assigneeId: bob.memberId, delegateId: agent.id })).body;
    const statuses = (await owner.get(`${org}/teams/${eng.id}/statuses`)).body as { id: string; name: string }[];

    const progress = await fetch(`${t.baseUrl}/api/v1${org}/issues/${issue.identifier}/progress`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ state: "blocked", message: "Need the API key" }),
    });
    expect(progress.status).toBe(201);
    await owner.patch(`${org}/issues/${issue.identifier}`, { version: 1, statusId: statuses.find((s) => s.name === "In Progress")!.id });

    const items = (await bob.client.get(`${org}/inbox`)).body as { type: string; progressState: string | null }[];
    expect(items.map((item) => item.type)).toEqual(["status_changed", "progress_posted"]);
    expect(items[1]!.progressState).toBe("blocked");
  });

  it("shows nothing about an issue the recipient cannot see, or one in the trash", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const sec = await createTeam(owner, org, "SEC", { private: true });
    const gus = await join(t.baseUrl, owner, org, "Gus", "guest", [eng.id]);

    const hidden = (await owner.post(`${org}/teams/${sec.id}/issues`, { title: "Layoffs plan" })).body;
    await owner.post(`${org}/issues/${hidden.identifier}/comments`, { body: "@gus can you look?" });
    expect((await gus.client.get(`${org}/inbox?filter=all`)).body).toEqual([]);
    expect((await gus.client.get(`${org}/inbox/unread-count`)).body).toEqual({ unreadCount: 0 });

    const moved = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Moves later", assigneeId: gus.memberId })).body;
    const trashed = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Trashed later", assigneeId: gus.memberId })).body;
    expect((await gus.client.get(`${org}/inbox`)).body).toHaveLength(2);
    const move = await owner.patch(`${org}/issues/${moved.identifier}`, { version: 1, teamId: sec.id, assigneeId: null });
    expect(move.status).toBe(200);
    await owner.delete(`${org}/issues/${trashed.identifier}`);
    expect((await gus.client.get(`${org}/inbox?filter=all`)).body).toEqual([]);
    expect((await gus.client.get(`${org}/inbox/unread-count`)).body).toEqual({ unreadCount: 0 });
  });

  it("matches whole handles only, and skips members who left", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const al = await join(t.baseUrl, owner, org, "Al", "member", [eng.id]);
    const alice = await join(t.baseUrl, owner, org, "Alice", "member", [eng.id]);
    const issue = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Hello" })).body;

    await owner.post(`${org}/issues/${issue.identifier}/comments`, { body: "Thanks @al." });
    expect((await al.client.get(`${org}/inbox`)).body).toHaveLength(1);
    expect((await alice.client.get(`${org}/inbox`)).body).toHaveLength(0);

    await owner.delete(`${org}/members/${alice.memberId}`);
    await owner.post(`${org}/issues/${issue.identifier}/comments`, { body: "@alice are you there?" });
    // Invited back, she is the same member, with nothing from while she was away.
    const invite = await owner.post(`${org}/invites`, { email: "alice@example.com", role: "member" });
    const token = new URL(invite.body.url).pathname.split("/").pop();
    expect((await alice.client.post(`/invites/${token}/accept`)).status).toBe(200);
    expect((await alice.client.get(`${org}/inbox?filter=all`)).body).toEqual([]);
  });

  it("records marking items read as an event, and answers 404 for an unknown item", async () => {
    const t = await startTestServer();
    const { owner, org, ownerId } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const bob = await join(t.baseUrl, owner, org, "Bob", "admin", [eng.id]);
    await bob.client.post(`${org}/teams/${eng.id}/issues`, { title: "For the owner", assigneeId: ownerId });
    const [item] = (await owner.get(`${org}/inbox`)).body;
    expect((await owner.patch(`${org}/inbox/${item.id}`, { read: true })).status).toBe(200);
    expect((await owner.post(`${org}/inbox/read-all`, {})).status).toBe(200);

    const events = (await owner.get(`${org}/events?limit=10`)).body as { type: string; actor: { id: string } | null; actorId?: string }[];
    expect(events.map((e) => e.type)).toContain("inbox.read");

    const missing = await owner.patch(`${org}/inbox/0190a000-0000-7000-8000-000000000000`, { read: true });
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toBe("No such inbox item.");
  });
});

