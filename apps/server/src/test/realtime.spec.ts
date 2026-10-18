import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createTeam, join, orgWithOwner } from "./org.js";
import { signUpAs, startTestServer } from "./server.js";

// Realtime: the server fans every committed event out over the /ws socket to
// the members of its organization who subscribed, so the web app can patch
// its collections without waiting for a refetch. Private-team events only go
// to people who can see the team.

interface Received {
  type: string;
  [key: string]: unknown;
}

function connect(baseUrl: string, cookie?: string): Promise<WebSocket> {
  // The ws client, since the browser one cannot send the session cookie.
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${baseUrl.replace("http", "ws")}/ws`, { headers: cookie ? { cookie } : {} });
    socket.on("open", () => resolve(socket));
    socket.on("unexpected-response", (_req, res) => reject(new Error(`upgrade answered ${res.statusCode}`)));
    socket.on("error", (error) => reject(error));
  });
}

// Resolves with the next message, with undefined when nothing arrives within
// `ms`, or with "closed" when the socket closes. Never throws.
async function nextMessage(socket: WebSocket, ms = 5_000): Promise<Received | "closed" | undefined> {
  return new Promise<Received | "closed" | undefined>((resolve) => {
    const timer = setTimeout(() => done(undefined), ms);
    function done(value: Received | "closed" | undefined) {
      clearTimeout(timer);
      socket.off("message", onMessage);
      socket.off("close", onClose);
      resolve(value);
    }
    function onMessage(body: unknown) {
      done(JSON.parse(String(body)));
    }
    function onClose() {
      done("closed");
    }
    socket.on("message", onMessage);
    socket.on("close", onClose);
  });
}

// Subscribes and waits for the ack or the error.
function subscribeAndAwait(socket: WebSocket, orgId: string): Promise<Received | "closed" | undefined> {
  socket.send(JSON.stringify({ type: "subscribe", orgId }));
  return nextMessage(socket);
}

describe("realtime", () => {
  it("answers the upgrade with 401 when signed out", async () => {
    const t = await startTestServer();
    await expect(connect(t.baseUrl)).rejects.toThrow("upgrade answered 401");
  });

  it("refuses to subscribe someone who is not a member", async () => {
    const t = await startTestServer();
    const { owner, orgId } = await orgWithOwner(t.baseUrl);
    const outsider = await signUpAs(t.baseUrl, "Outsider");

    const socket = await connect(t.baseUrl, outsider.cookie);
    const answer = await subscribeAndAwait(socket, orgId);
    expect(answer).toMatchObject({ type: "error" });
    expect(await nextMessage(socket, 2_000)).toBe("closed");

    const member = await connect(t.baseUrl, owner.cookie);
    expect(await subscribeAndAwait(member, orgId)).toMatchObject({ type: "subscribed", orgId });
  });

  it("sends the organization's events to a subscriber, with actor and data", async () => {
    const t = await startTestServer();
    const { owner, orgId, ownerId } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, `/organizations/${orgId}`, "ENG");
    const maya = await join(t.baseUrl, owner, `/organizations/${orgId}`, "Maya", "member");

    const socket = await connect(t.baseUrl, maya.client.cookie);
    expect(await subscribeAndAwait(socket, orgId)).toMatchObject({ type: "subscribed", orgId });

    await owner.post(`/organizations/${orgId}/teams/${eng.id}/issues`, { title: "Realtime" });
    const event: Received = (await nextMessage(socket)) as Received;
    expect(event).toMatchObject({
      type: "issue.created",
      organizationId: orgId,
      actor: { id: ownerId, kind: "human", name: "Owner" },
      data: { title: "Realtime" },
    });
    expect(typeof event.subjectId).toBe("string");
  });

  it("hides private-team events from members outside the team, and sends them to the owner", async () => {
    const t = await startTestServer();
    const { owner, orgId } = await orgWithOwner(t.baseUrl);
    const org = `/organizations/${orgId}`;
    const eng = await createTeam(owner, org, "ENG");
    const ops = await createTeam(owner, org, "OPS", { private: true });
    const member = await join(t.baseUrl, owner, org, "Member", "member");
    const guest = await join(t.baseUrl, owner, org, "Guest", "guest", [eng.id]);

    const sockets = await Promise.all([member, guest].map((person) => connect(t.baseUrl, person.client.cookie)));
    await Promise.all(sockets.map((socket) => subscribeAndAwait(socket, orgId)));

    await owner.post(`${org}/teams/${ops.id}/issues`, { title: "Classified" });
    await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Shared" });
    for (const socket of sockets) {
      expect(await nextMessage(socket)).toMatchObject({ type: "issue.created", data: { title: "Shared" } });
    }

    const boss = await connect(t.baseUrl, owner.cookie);
    await subscribeAndAwait(boss, orgId);
    await owner.post(`${org}/teams/${ops.id}/issues`, { title: "Classified 2" });
    expect(await nextMessage(boss)).toMatchObject({ type: "issue.created", data: { title: "Classified 2" } });
  });

  it("sends nothing from an organization the subscriber did not subscribe to", async () => {
    const t = await startTestServer();
    const { owner, orgId } = await orgWithOwner(t.baseUrl);
    // A different organization, made by its own owner: the slug must differ.
    const other = await signUpAs(t.baseUrl, "Elsewhere");
    const made = await other.post("/organizations", { name: "Elsewhere", slug: "elsewhere" });
    expect(made.status).toBe(201);
    const otherOrgId = made.body.organization.id as string;
    const team = (await other.post(`/organizations/${otherOrgId}/teams`, { name: "ENG", key: "ENG" })).body as {
      id: string;
    };

    const socket = await connect(t.baseUrl, owner.cookie);
    await subscribeAndAwait(socket, orgId);

    await other.post(`/organizations/${otherOrgId}/teams/${team.id}/issues`, { title: "Not yours" });

    expect(await nextMessage(socket, 1_000)).toBeUndefined();
  });
});
