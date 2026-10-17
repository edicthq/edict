import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startTestServer } from "./server.js";

function fakeWebBuild(): string {
  const dir = mkdtempSync(join(tmpdir(), "edict-web-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><div id=root></div>");
  writeFileSync(join(dir, "assets", "app-abc123.js"), "console.log('edict')");
  return dir;
}

describe("serving the web app", () => {
  it("serves built assets with long caching", async () => {
    const t = await startTestServer({ webDir: fakeWebBuild() });
    const res = await fetch(`${t.baseUrl}/assets/app-abc123.js`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("edict");
    expect(res.headers.get("cache-control")).toContain("immutable");
  });

  it("answers app routes with index.html so the client router takes over", async () => {
    const t = await startTestServer({ webDir: fakeWebBuild() });
    for (const path of ["/", "/acme/members", "/invite/some-token"]) {
      const res = await fetch(`${t.baseUrl}${path}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(res.headers.get("cache-control")).toBe("no-cache");
    }
  });

  it("leaves API routes alone", async () => {
    const t = await startTestServer({ webDir: fakeWebBuild() });
    const res = await fetch(`${t.baseUrl}/api/v1/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).not.toContain("text/html");
  });
});
