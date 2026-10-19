import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { join } from "node:path";
import { test as base } from "@playwright/test";
import { PostgreSqlContainer } from "@testcontainers/postgresql";

// A fresh Edict instance per worker, which means per browser: Postgres plus the
// built server (apps/server/dist) serving the built web app (apps/web/dist),
// the way the Docker image runs. `pnpm e2e` builds both first.
// biome-ignore lint/complexity/noBannedTypes: Playwright types "no test fixtures" as {}
export const test = base.extend<{}, { instance: Instance; instanceUrl: string }>({
  instance: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this pattern
    async ({}, use) => {
      const postgres = await new PostgreSqlContainer("postgres:18-alpine").start();
      // Any free port: a fixed one collides with whatever dev server is up.
      const port = await freePort();
      const url = `http://localhost:${port}`;
      const root = join(import.meta.dirname, "../..");
      // Attachment bytes (ADR 0020) go under their own temp dir.
      const dataDir = await mkdtemp(join(tmpdir(), "edict-e2e-"));
      // Stands in for GitHub's latest release, so the update check never
      // leaves the machine and always finds 99.0.0, and for the telemetry
      // collector.
      const releases = createHttpServer((_req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ tag_name: "v99.0.0", html_url: "https://github.com/edicthq/edict/releases/tag/v99.0.0" }));
      });
      await new Promise<void>((resolve) => releases.listen(0, "127.0.0.1", resolve));
      const releasesPort = (releases.address() as { port: number }).port;
      const server = spawn("node", [join(root, "server/dist/index.js")], {
        env: {
          ...process.env,
          NODE_ENV: "production",
          PORT: String(port),
          DATABASE_URL: postgres.getConnectionUri(),
          WEB_DIR: join(root, "web/dist"),
          BETTER_AUTH_URL: url,
          BETTER_AUTH_SECRET: "",
          // The tests sign several people up from the same address, which the
          // production rate limiter would turn away.
          AUTH_RATE_LIMIT: "off",
          SMTP_URL: "",
          DATA_DIR: dataDir,
          RELEASES_URL: `http://127.0.0.1:${releasesPort}/releases/latest`,
          // Telemetry is off unless a test turns it on; even then, no ping leaves.
          TELEMETRY_URL: `http://127.0.0.1:${releasesPort}/v1/ping`,
        },
        stdio: ["ignore", "inherit", "inherit"],
      });

      try {
        await waitForHealth(url, () => server.exitCode !== null);
        await use({
          url,
          sql: async (query) => {
            const result = await postgres.exec(["psql", "-U", postgres.getUsername(), "-d", postgres.getDatabase(), "-c", query]);
            if (result.exitCode !== 0) throw new Error(result.output);
          },
        });
      } finally {
        server.kill();
        releases.close();
        await postgres.stop();
      }
    },
    { scope: "worker", timeout: 120_000 },
  ],
  instanceUrl: [async ({ instance }, use) => use(instance.url), { scope: "worker" }],
  baseURL: async ({ instanceUrl }, use) => use(instanceUrl),
});

export { expect } from "@playwright/test";

// The worker's instance: its URL, and its database for the rare test that
// must set something no API can.
export interface Instance {
  url: string;
  sql: (query: string) => Promise<void>;
}

async function waitForHealth(url: string, exited: () => boolean): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !exited()) {
    try {
      // Edict's own answer, not some other server's page on the port.
      const res = await fetch(`${url}/health`);
      if (res.ok && ((await res.json().catch(() => null)) as { ok?: boolean } | null)?.ok === true) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The Edict server did not start for the e2e tests");
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "localhost", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}
