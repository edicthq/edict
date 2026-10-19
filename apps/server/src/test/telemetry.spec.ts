// Opt-in telemetry (ADR 0026): off by default; when an instance admin turns
// it on, one ping a day with the version and a user-count bucket, exactly as
// the instance page shows it.
import { createServer, type IncomingHttpHeaders } from "node:http";
import { onTestFinished, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { VERSION } from "../version.js";
import { createTestDatabase, signUpAs, startTestServer } from "./server.js";

// Stands in for telemetry.edict.dev and records each ping.
async function fakeCollector(status = 204) {
  const pings: { method?: string; url?: string; headers: IncomingHttpHeaders; body: string }[] = [];
  const answer = { status };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      pings.push({ method: req.method, url: req.url, headers: req.headers, body });
      res.writeHead(answer.status).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}/v1/ping`, pings, answer };
}

describe("telemetry", () => {
  it("is off by default and shows the payload it would send", async () => {
    const collector = await fakeCollector();
    const t = await startTestServer({ telemetryUrl: collector.url });
    const admin = await signUpAs(t.baseUrl, "Admin");
    expect((await admin.get("/instance/status")).body.telemetry).toEqual({
      enabled: false,
      payload: { version: VERSION, users: "1" },
      sentAt: null,
      error: null,
    });
    await t.sendTelemetry();
    expect(collector.pings).toEqual([]);
  });

  it("counts users in buckets", async () => {
    const t = await startTestServer();
    const admin = await signUpAs(t.baseUrl, "Admin");
    await signUpAs(t.baseUrl, "Mia");
    await signUpAs(t.baseUrl, "Noor");
    expect((await admin.get("/instance/status")).body.telemetry.payload).toEqual({ version: VERSION, users: "2-10" });
  });

  it("sends exactly the payload once turned on, and nothing else", async () => {
    const collector = await fakeCollector();
    const t = await startTestServer({ telemetryUrl: collector.url });
    const admin = await signUpAs(t.baseUrl, "Admin");
    expect((await admin.patch("/instance", { telemetry: true })).status).toBe(200);

    await t.sendTelemetry();
    expect(collector.pings).toHaveLength(1);
    const [ping] = collector.pings;
    expect(ping?.method).toBe("POST");
    expect(ping?.url).toBe("/v1/ping");
    expect(JSON.parse(ping?.body ?? "")).toEqual({ version: VERSION, users: "1" });
    expect(ping?.body).toBe(JSON.stringify((await admin.get("/instance/status")).body.telemetry.payload));
    expect(ping?.headers["user-agent"]).toBe("Edict");
    expect(ping?.headers["content-type"]).toBe("application/json");
    expect(ping?.headers.cookie).toBeUndefined();
    expect(ping?.headers.authorization).toBeUndefined();

    const status = (await admin.get("/instance/status")).body.telemetry;
    expect(status).toMatchObject({ enabled: true, error: null });
    expect(Date.parse(status.sentAt)).toBeGreaterThan(Date.now() - 60_000);
  });

  it("records why a ping failed", async () => {
    const collector = await fakeCollector(500);
    const t = await startTestServer({ telemetryUrl: collector.url });
    const admin = await signUpAs(t.baseUrl, "Admin");
    await admin.patch("/instance", { telemetry: true });
    await t.sendTelemetry();
    expect((await admin.get("/instance/status")).body.telemetry.error).toContain("500");
  });

  it("is an instance admin's to turn on, as an instance event, and stops when turned off", async () => {
    const database = await createTestDatabase();
    const collector = await fakeCollector();
    const t = await startTestServer({ database, telemetryUrl: collector.url });
    const admin = await signUpAs(t.baseUrl, "Admin");
    const mia = await signUpAs(t.baseUrl, "Mia");
    expect((await mia.patch("/instance", { telemetry: true })).status).toBe(403);

    await admin.patch("/instance", { telemetry: true });
    await admin.patch("/instance", { telemetry: false });
    await t.sendTelemetry();
    expect(collector.pings).toEqual([]);

    const pool = new Pool({ connectionString: database.url });
    const { rows } = await pool.query(`SELECT type, data FROM instance_events ORDER BY id`);
    await pool.end();
    expect(rows).toEqual([
      { type: "instance.telemetry_changed", data: { from: false, to: true } },
      { type: "instance.telemetry_changed", data: { from: true, to: false } },
    ]);
  });
});
