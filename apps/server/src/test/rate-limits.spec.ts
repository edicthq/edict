import { describe, expect, it } from "vitest";
import { runner } from "./agent-client.js";
import { createTeam, orgWithOwner } from "./org.js";
import { startTestServer } from "./server.js";

describe("agent rate limits", () => {
  it("limits requests per token per minute with 429 and Retry-After", async () => {
    const t = await startTestServer({ agentLimits: { requestsPerMinute: 3, issuesPerHour: 60 } });
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const ferro = await runner(t.baseUrl, owner, org, []);

    for (let i = 0; i < 3; i++) {
      expect((await ferro.client.get(`${org}/teams`)).status).toBe(200);
    }
    const limited = await ferro.client.get(`${org}/teams`);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("rate_limited");
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);

    // People are not limited this way, and other tokens have their own count.
    for (let i = 0; i < 5; i++) {
      expect((await owner.get(`${org}/teams`)).status).toBe(200);
    }
    const other = await runner(t.baseUrl, owner, org, [], "Sable");
    expect((await other.client.get(`${org}/teams`)).status).toBe(200);
  });

  it("limits the issues an agent creates per hour", async () => {
    const t = await startTestServer({ agentLimits: { requestsPerMinute: 600, issuesPerHour: 2 } });
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const ferro = await runner(t.baseUrl, owner, org, [eng.id]);

    expect((await ferro.client.post(`${org}/teams/${eng.id}/issues`, { title: "One" })).status).toBe(201);
    expect((await ferro.client.post(`${org}/teams/${eng.id}/issues`, { title: "Two" })).status).toBe(201);
    const third = await ferro.client.post(`${org}/teams/${eng.id}/issues`, { title: "Three" });
    expect(third.status).toBe(429);
    expect(third.body.error.message).toMatch(/2 issues an hour/);
    expect((await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Mine" })).status).toBe(201);
  });
});
