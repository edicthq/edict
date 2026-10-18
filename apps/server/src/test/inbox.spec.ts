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
