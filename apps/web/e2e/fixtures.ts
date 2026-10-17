import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { test as base } from "@playwright/test";
import { PostgreSqlContainer } from "@testcontainers/postgresql";

// A fresh Edict instance per worker, which means per browser: Postgres plus the
// built server (apps/server/dist) serving the built web app (apps/web/dist),
// the way the Docker image runs. `pnpm e2e` builds both first.
export const test = base.extend<{}, { instanceUrl: string }>({
  instanceUrl: [
    async ({}, use, workerInfo) => {
      const postgres = await new PostgreSqlContainer("postgres:18-alpine").start();
      const port = 3100 + workerInfo.parallelIndex;
      const url = `http://localhost:${port}`;
      const root = join(import.meta.dirname, "../..");
      // Attachment bytes (ADR 0020) go under their own temp dir.
      const dataDir = await mkdtemp(join(tmpdir(), "edict-e2e-"));
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
        },
        stdio: ["ignore", "inherit", "inherit"],
      });

      try {
        await waitForHealth(url, () => server.exitCode !== null);
        await use(url);
      } finally {
        server.kill();
        await postgres.stop();
      }
    },
    { scope: "worker", timeout: 120_000 },
  ],
  baseURL: async ({ instanceUrl }, use) => use(instanceUrl),
});

export { expect } from "@playwright/test";

async function waitForHealth(url: string, exited: () => boolean): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !exited()) {
    try {
      if ((await fetch(`${url}/health`)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The Edict server did not start for the e2e tests");
}
