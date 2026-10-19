import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, onTestFinished } from "vitest";
import { runner } from "./agent-client.js";
import { createTeam, join, orgWithOwner } from "./org.js";
import { startTestServer } from "./server.js";
import { sendWebhook } from "../outbound.js";

interface Received {
  headers: Record<string, string>;
  body: string;
  json: { id: string; type: string; actor: { id: string; kind: string }; subjectId: string; data: Record<string, unknown> };
}

// An HTTP endpoint that records what it receives and answers `status`.
async function receiver(status = 200) {
  const received: Received[] = [];
  const state = { status };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ headers: req.headers as Record<string, string>, body, json: JSON.parse(body) });
      res.writeHead(state.status, { "content-type": "text/plain" });
      res.end(state.status < 300 ? "ok" : "nope");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`, received, state };
}

async function eventually<T>(check: () => Promise<T | undefined> | T | undefined, ms = 15_000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > until) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// The receivers listen on 127.0.0.1, which instances refuse unless told to
// allow private webhook targets.
const fast = { jobs: true, webhookRetry: { limit: 1, delaySeconds: 1 }, privateWebhookTargets: true };

describe("webhooks", () => {
  it("delivers subscribed events, signed, and logs each delivery", async () => {
    const t = await startTestServer(fast);
    const { owner, org, ownerId } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const hook = await receiver();

    const created = await owner.post(`${org}/webhooks`, { url: hook.url, eventTypes: ["issue.created"] });
    expect(created.status).toBe(201);
    const { webhook, secret } = created.body;
    expect(secret).toMatch(/^whsec_/);
    expect(JSON.stringify((await owner.get(`${org}/webhooks`)).body)).not.toContain(secret);

    await owner.post(`${org}/teams/${eng.id}/labels`, { name: "not-sent" });
    const issue = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Hello" })).body;

    const got = await eventually(() => hook.received[0]);
    expect(hook.received).toHaveLength(1);
    expect(got.json).toMatchObject({ type: "issue.created", subjectId: issue.id, actor: { id: ownerId, kind: "human" } });
    expect(got.headers["edict-event"]).toBe("issue.created");
    const [, t1, v1] = /^t=(\d+),v1=([0-9a-f]+)$/.exec(got.headers["edict-signature"]!)!;
    expect(v1).toBe(createHmac("sha256", secret).update(`${t1}.${got.body}`).digest("hex"));

    const log = await eventually(async () => {
      const res = await owner.get(`${org}/webhooks/${webhook.id}/deliveries`);
      return res.body[0]?.status === "delivered" ? res.body : undefined;
    });
    expect(log[0]).toMatchObject({ eventId: got.json.id, eventType: "issue.created", responseStatus: 200, attempts: 1 });
    expect(got.headers["edict-delivery"]).toBe(log[0].id);

    // Redelivering sends the same payload again as a new delivery.
    const again = await owner.post(`${org}/webhooks/${webhook.id}/deliveries/${log[0].id}/redeliver`);
    expect(again.status).toBe(201);
    await eventually(() => hook.received[1]);
    expect(hook.received[1]!.body).toBe(got.body);
  });

  it("wakes an agent's runner for issues delegated to it", async () => {
    const t = await startTestServer(fast);
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const ferro = await runner(t.baseUrl, owner, org, [eng.id]);
    const hook = await receiver();
    expect((await owner.post(`${org}/webhooks`, { url: hook.url, agentId: ferro.id, eventTypes: ["agent.paused"] })).status).toBe(201);
    expect((await owner.get(`${org}/agents/${ferro.id}`)).body.webhook).toBe(true);

    const other = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Not theirs" })).body;
    const issue = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Theirs" })).body;
    await owner.patch(`${org}/issues/${issue.identifier}`, { version: 1, delegateId: ferro.id });
    await owner.post(`${org}/issues/${issue.identifier}/comments`, { body: "Over to you" });
    await owner.post(`${org}/issues/${other.identifier}/comments`, { body: "Not for the agent" });

    await eventually(() => hook.received.length >= 2);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(hook.received.map((r) => r.json.type)).toEqual(["issue.updated", "comment.created"]);
    expect(hook.received.every((r) => r.body.includes(issue.id))).toBe(true);
  });

  it("disables itself when deliveries run out of retries", async () => {
    const t = await startTestServer(fast);
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const hook = await receiver(500);
    const { webhook } = (await owner.post(`${org}/webhooks`, { url: hook.url })).body;

    await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Hello" });
    const disabled = await eventually(async () => {
      const res = await owner.get(`${org}/webhooks/${webhook.id}`);
      return res.body.disabledAt ? res.body : undefined;
    }, 30_000);
    expect(disabled.disabledReason).toMatch(/500/);
    const deliveries = (await owner.get(`${org}/webhooks/${webhook.id}/deliveries`)).body as { attempts: number }[];
    const delivery = deliveries.find((d) => d.attempts === 2);
    expect(delivery).toMatchObject({ status: "failed", responseStatus: 500, attempts: 2, responseBody: "nope" });
    const types = (await owner.get(`${org}/events`)).body.map((e: { type: string }) => e.type);
    expect(types).toContain("webhook.disabled");

    // Turned back on, it delivers again.
    hook.state.status = 200;
    const on = await owner.patch(`${org}/webhooks/${webhook.id}`, { version: disabled.version, enabled: true });
    expect(on.body.disabledAt).toBeNull();
    await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Again" });
    await eventually(() => hook.received.find((r) => r.json.type === "issue.created" && r.body.includes("Again")));
  }, 40_000);

  it("is for Admins, and pausing an agent disables its webhooks", async () => {
    const t = await startTestServer(fast);
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const { client: mina } = await join(t.baseUrl, owner, org, "Mina", "member");
    const ferro = await runner(t.baseUrl, owner, org, []);
    const hook = await receiver();
    expect((await mina.post(`${org}/webhooks`, { url: hook.url })).status).toBe(403);
    expect((await mina.get(`${org}/webhooks`)).status).toBe(403);
    expect((await owner.post(`${org}/webhooks`, { url: "ftp://example.com" })).status).toBe(400);

    const { webhook } = (await owner.post(`${org}/webhooks`, { url: hook.url, agentId: ferro.id })).body;
    await owner.post(`${org}/agents/${ferro.id}/pause`);
    const after = (await owner.get(`${org}/webhooks/${webhook.id}`)).body;
    expect(after.disabledAt).not.toBeNull();
    expect((await owner.get(`${org}/agents/${ferro.id}`)).body.webhook).toBe(false);

    const rotated = await owner.post(`${org}/webhooks/${webhook.id}/rotate-secret`);
    expect(rotated.status).toBe(200);
    expect(rotated.body.secret).toMatch(/^whsec_/);
    expect((await owner.delete(`${org}/webhooks/${webhook.id}`)).status).toBe(204);
    expect((await owner.get(`${org}/webhooks`)).body).toEqual([]);
  });
});

describe("webhook targets", () => {
  it("refuses loopback, private and link-local addresses unless the instance allows them", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    for (const url of [
      "http://127.0.0.1:9000/hook",
      "http://localhost/hook",
      "http://10.0.0.5/hook",
      "http://192.168.1.10/hook",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/hook",
      "http://[fd00::1]/hook",
      "http://[::ffff:127.0.0.1]/hook",
    ]) {
      const res = await owner.post(`${org}/webhooks`, { url });
      expect(res.status, url).toBe(400);
      expect(res.body.error.message).toMatch(/private/);
    }
    const { webhook } = (await owner.post(`${org}/webhooks`, { url: "https://example.com/hook" })).body;
    const moved = await owner.patch(`${org}/webhooks/${webhook.id}`, { version: webhook.version, url: "http://127.0.0.1/hook" });
    expect(moved.status).toBe(400);
  });

  it("checks where a name resolves when it sends, not only when the webhook is saved", async () => {
    const hook = await receiver();
    const url = hook.url.replace("127.0.0.1", "localhost");
    await expect(sendWebhook(url, {}, "{}", { allowPrivate: false })).rejects.toThrow(/private address/);
    expect(hook.received).toHaveLength(0);
    const sent = await sendWebhook(url, { "content-type": "application/json" }, "{}", { allowPrivate: true });
    expect(sent.status).toBe(200);
    expect(hook.received).toHaveLength(1);
  });
});
