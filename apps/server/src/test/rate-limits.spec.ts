import { describe, expect, it } from "vitest";
import { runner } from "./agent-client.js";
import { createTeam, orgWithOwner } from "./org.js";
import { request } from "node:http";
import { Pool } from "pg";
import { RequestLimiter } from "../api/rate-limit.js";
import { ConfigError, readConfig } from "../env.js";
import { createTestDatabase, startTestServer } from "./server.js";

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

describe("what strangers can grow", () => {
  it("keeps the request limiter bounded however many tokens it sees", () => {
    const limiter = new RequestLimiter(600, 1_000);
    for (let i = 0; i < 20_000; i++) limiter.take(`random-${i}`, 0);
    expect(limiter.size).toBeLessThanOrEqual(1_000);
    // The most recent key keeps its count.
    for (let i = 0; i < 600; i++) limiter.take("busy", 0);
    expect(limiter.take("busy", 0)).toBeGreaterThan(0);
  });

  it("needs the public URL in production", () => {
    const base = { DATABASE_URL: "postgres://x@localhost/x", NODE_ENV: "production" };
    expect(() => readConfig(base)).toThrow(ConfigError);
    expect(readConfig({ ...base, BETTER_AUTH_URL: "https://edict.example.com" }).baseUrl).toBe("https://edict.example.com");
  });

  it("registers an OAuth resource for a bounded number of hosts when no public URL is set", async () => {
    const database = await createTestDatabase();
    const t = await startTestServer({ database });
    const port = new URL(t.baseUrl).port;
    for (let i = 0; i < 40; i++) {
      await new Promise<void>((resolve, reject) => {
        const req = request({ host: "127.0.0.1", port, path: "/.well-known/oauth-protected-resource", headers: { host: `h${i}.example:${port}` } }, (res) => {
          res.resume();
          res.on("end", () => resolve());
        });
        req.on("error", reject);
        req.end();
      });
    }
    const pool = new Pool({ connectionString: database.url });
    try {
      const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM oauth_resource");
      expect(rows[0]!.n).toBeLessThanOrEqual(20);
    } finally {
      await pool.end();
    }
  });
});

