// The telemetry collector (ADR 0026), through HTTP against real Postgres. It
// keeps how many pings arrived per day, version and user-count bucket, and
// nothing that could tell one instance from another.
import { randomUUID } from "node:crypto";
import { onTestFinished, describe, expect, it } from "vitest";
import pg from "pg";
import { startCollector } from "../collector.js";

async function collector(now = () => new Date("2027-02-01T10:00:00Z")) {
  const adminUrl = process.env.DATABASE_URL!;
  const name = `t${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString: adminUrl });
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString() });
  const running = await startCollector({ pool, port: 0, now });
  onTestFinished(async () => {
    await running.close();
    await pool.end();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  });
  const base = `http://127.0.0.1:${running.port}`;
  const ping = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}/v1/ping`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  const stats = async () => (await (await fetch(`${base}/v1/stats`)).json()) as { days: unknown[] };
  return { base, pool, ping, stats };
}

describe("the telemetry collector", () => {
  it("counts pings per day, version and bucket", async () => {
    const c = await collector();
    expect((await c.ping({ version: "1.4.2", users: "2-10" })).status).toBe(204);
    expect((await c.ping({ version: "1.4.2", users: "2-10" })).status).toBe(204);
    expect((await c.ping({ version: "1.5.0", users: "1" })).status).toBe(204);
    expect(await c.stats()).toEqual({
      days: [
        { day: "2027-02-01", version: "1.4.2", users: "2-10", pings: 2 },
        { day: "2027-02-01", version: "1.5.0", users: "1", pings: 1 },
      ],
    });
  });

  it("keeps only the counts: no address, no time finer than the day", async () => {
    const c = await collector();
    await c.ping({ version: "1.4.2", users: "1" }, { "x-forwarded-for": "203.0.113.9" });
    const { rows: columns } = await c.pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`,
    );
    expect(columns.map((row) => row.column_name)).toEqual(["day", "version", "users", "pings"]);
    const { rows } = await c.pool.query(`SELECT * FROM pings`);
    expect(JSON.stringify(rows)).not.toContain("203.0.113.9");
  });

  it("refuses anything but the payload", async () => {
    const c = await collector();
    for (const body of [
      { version: "1.4.2", users: "2-10", instance: "abc" },
      { version: "1.4.2", users: "3" },
      { version: "latest", users: "1" },
      { users: "1" },
      "not json",
      JSON.stringify({ version: "1.4.2", users: "1", padding: "x".repeat(4000) }),
    ]) {
      expect((await c.ping(body)).status).toBe(400);
    }
    expect(await c.stats()).toEqual({ days: [] });
  });

  it("shows the last 90 days", async () => {
    let now = new Date("2027-01-01T10:00:00Z");
    const c = await collector(() => now);
    await c.ping({ version: "1.0.0", users: "1" });
    now = new Date("2027-04-15T10:00:00Z");
    await c.ping({ version: "1.1.0", users: "1" });
    expect(await c.stats()).toEqual({ days: [{ day: "2027-04-15", version: "1.1.0", users: "1", pings: 1 }] });
  });

  it("answers /health", async () => {
    const c = await collector();
    expect(await (await fetch(`${c.base}/health`)).json()).toEqual({ ok: true });
  });
});
