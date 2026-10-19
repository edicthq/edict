// The update check: an instance asks GitHub for Edict's latest release and
// tells its admins when it is newer than what they run. It can be turned off.
import { createServer, type IncomingHttpHeaders } from "node:http";
import { onTestFinished, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { VERSION } from "../version.js";
import { createTestDatabase, signUpAs, startTestServer } from "./server.js";

// Stands in for GitHub's "latest release" endpoint and records each request.
async function fakeReleases(answer: { status: number; body?: unknown }) {
  const requests: { method?: string; headers: IncomingHttpHeaders }[] = [];
  const server = createServer((req, res) => {
    requests.push({ method: req.method, headers: req.headers });
    res.writeHead(answer.status, { "content-type": "application/json" });
    res.end(JSON.stringify(answer.body ?? {}));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}/repos/edicthq/edict/releases/latest`, requests, answer };
}

const release = (tag: string) => ({
  tag_name: tag,
  html_url: `https://github.com/edicthq/edict/releases/tag/${tag}`,
  published_at: "2027-01-29T12:00:00Z",
});

describe("the update check", () => {
  it("is on and has not run on a fresh instance", async () => {
    const releases = await fakeReleases({ status: 200, body: release("v99.0.0") });
    const t = await startTestServer({ releasesUrl: releases.url });
    const admin = await signUpAs(t.baseUrl, "Admin");
    const status = (await admin.get("/instance/status")).body;
    expect(status.updates).toEqual({ check: true, latest: null, available: false, checkedAt: null, error: null });
    expect(releases.requests).toEqual([]);
  });

  it("finds a newer release, asking GitHub nothing but the release", async () => {
    const releases = await fakeReleases({ status: 200, body: release("v99.0.0") });
    const t = await startTestServer({ releasesUrl: releases.url });
    const admin = await signUpAs(t.baseUrl, "Admin");

    const res = await admin.post("/instance/update-check", {});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      check: true,
      latest: {
        version: "99.0.0",
        url: "https://github.com/edicthq/edict/releases/tag/v99.0.0",
        publishedAt: "2027-01-29T12:00:00.000Z",
      },
      available: true,
      error: null,
    });
    expect(Date.parse(res.body.checkedAt)).toBeGreaterThan(Date.now() - 60_000);
    expect((await admin.get("/instance/status")).body.updates).toEqual(res.body);

    // A plain GET: no cookie, no instance URL, no version in the user agent.
    expect(releases.requests).toHaveLength(1);
    const [request] = releases.requests;
    expect(request?.method).toBe("GET");
    expect(request?.headers["user-agent"]).toBe("Edict");
    expect(request?.headers.cookie).toBeUndefined();
    expect(request?.headers.authorization).toBeUndefined();
    const { host: _host, ...sent } = request?.headers ?? {};
    expect(JSON.stringify(sent)).not.toContain(VERSION);
  });

  it("says nothing is available when the latest release is the one running", async () => {
    const releases = await fakeReleases({ status: 200, body: release(`v${VERSION}`) });
    const t = await startTestServer({ releasesUrl: releases.url });
    const admin = await signUpAs(t.baseUrl, "Admin");
    const res = await admin.post("/instance/update-check", {});
    expect(res.body).toMatchObject({ latest: { version: VERSION }, available: false });
  });

  it("keeps the last answer and records the error when GitHub fails", async () => {
    const releases = await fakeReleases({ status: 200, body: release("v99.0.0") });
    const t = await startTestServer({ releasesUrl: releases.url });
    const admin = await signUpAs(t.baseUrl, "Admin");
    await admin.post("/instance/update-check", {});

    releases.answer.status = 503;
    const failed = (await admin.post("/instance/update-check", {})).body;
    expect(failed).toMatchObject({ latest: { version: "99.0.0" }, available: true });
    expect(failed.error).toContain("503");

    releases.answer.status = 200;
    releases.answer.body = { tag_name: "not-a-version" };
    expect((await admin.post("/instance/update-check", {})).body.error).toContain("not-a-version");
  });

  it("is for instance admins only", async () => {
    const releases = await fakeReleases({ status: 200, body: release("v99.0.0") });
    const t = await startTestServer({ releasesUrl: releases.url });
    await signUpAs(t.baseUrl, "Admin");
    const mia = await signUpAs(t.baseUrl, "Mia");
    expect((await mia.post("/instance/update-check", {})).status).toBe(403);
    expect((await mia.patch("/instance", { updateCheck: false })).status).toBe(403);
    expect(releases.requests).toEqual([]);
  });

  it("turns off, after which the instance never asks GitHub, as an instance event", async () => {
    const database = await createTestDatabase();
    const releases = await fakeReleases({ status: 200, body: release("v99.0.0") });
    const t = await startTestServer({ database, releasesUrl: releases.url });
    const admin = await signUpAs(t.baseUrl, "Admin");

    expect((await admin.patch("/instance", { updateCheck: false })).status).toBe(200);
    expect((await admin.get("/instance/status")).body.updates).toMatchObject({ check: false });
    const res = await admin.post("/instance/update-check", {});
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("off");
    expect(releases.requests).toEqual([]);

    await admin.patch("/instance", { updateCheck: true });
    const pool = new Pool({ connectionString: database.url });
    const { rows } = await pool.query(`SELECT type, data FROM instance_events ORDER BY id`);
    await pool.end();
    expect(rows).toEqual([
      { type: "instance.update_check_changed", data: { from: true, to: false } },
      { type: "instance.update_check_changed", data: { from: false, to: true } },
    ]);
  });
});

describe("isNewer", () => {
  it("compares versions by semver, with a prerelease before its release", async () => {
    const { isNewer } = await import("../version.js");
    expect(isNewer("1.10.0", "1.9.9")).toBe(true);
    expect(isNewer("1.4.2", "1.4.2")).toBe(false);
    expect(isNewer("0.0.2", "0.0.10")).toBe(false);
    expect(isNewer("1.5.0", "1.5.0-rc.1")).toBe(true);
    expect(isNewer("1.5.0-rc.1", "1.5.0")).toBe(false);
    expect(isNewer("1.5.0-rc.10", "1.5.0-rc.9")).toBe(true);
    expect(isNewer("2.0.0-rc.1", "1.9.0")).toBe(true);
  });
});
