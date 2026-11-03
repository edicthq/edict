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
// Spec files run in name order on that one instance. m1-exit sets up a fresh
// instance, so a spec that signs someone up must sort after it.
// biome-ignore lint/complexity/noBannedTypes: Playwright types "no test fixtures" as {}
export const test = base.extend<{}, { instance: Instance; instanceUrl: string; mailInstance: MailInstance }>({
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
  // A second instance, started only for the tests that ask for it, that sends
  // email through a stand-in for Resend's API and keeps every email.
  mailInstance: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this pattern
    async ({}, use) => {
      const postgres = await new PostgreSqlContainer("postgres:18-alpine").start();
      const port = await freePort();
      const url = `http://localhost:${port}`;
      const root = join(import.meta.dirname, "../..");
      const dataDir = await mkdtemp(join(tmpdir(), "edict-e2e-mail-"));
      const emails: Email[] = [];
      let refusal: string | null = null;
      const resend = createHttpServer((req, res) => {
        let raw = "";
        req.on("data", (chunk) => {
          raw += chunk;
        });
        req.on("end", () => {
          if (refusal) {
            res.writeHead(403, { "content-type": "application/json" });
            res.end(JSON.stringify({ statusCode: 403, name: "validation_error", message: refusal }));
            return;
          }
          const body = JSON.parse(raw || "{}") as { to: string[]; subject: string; text: string };
          emails.push({ to: body.to[0] ?? "", subject: body.subject, text: body.text });
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ id: `email-${emails.length}` }));
        });
      });
      await new Promise<void>((resolve) => resend.listen(0, "127.0.0.1", resolve));
      const resendPort = (resend.address() as { port: number }).port;
      const server = spawn("node", [join(root, "server/dist/index.js")], {
        env: {
          ...process.env,
          NODE_ENV: "production",
          PORT: String(port),
          DATABASE_URL: postgres.getConnectionUri(),
          WEB_DIR: join(root, "web/dist"),
          BETTER_AUTH_URL: url,
          BETTER_AUTH_SECRET: "",
          AUTH_RATE_LIMIT: "off",
          SMTP_URL: "",
          RESEND_API_KEY: "re_e2e",
          RESEND_API_URL: `http://127.0.0.1:${resendPort}`,
          EMAIL_FROM: "Edict <edict@mail.example.com>",
          DATA_DIR: dataDir,
          // No update check or telemetry leaves the machine.
          RELEASES_URL: "http://127.0.0.1:9/releases/latest",
          TELEMETRY_URL: "http://127.0.0.1:9/v1/ping",
        },
        stdio: ["ignore", "inherit", "inherit"],
      });
      try {
        await waitForHealth(url, () => server.exitCode !== null);
        await use({
          url,
          emails,
          refuse: (message) => {
            refusal = message;
          },
          waitForEmail: async (to, subject) => {
            for (let i = 0; i < 100; i++) {
              const found = emails.filter((e) => e.to === to && subject.test(e.subject)).at(-1);
              if (found) return found;
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
            throw new Error(`No email to ${to} matching ${subject}; sent: ${emails.map((e) => e.subject).join(", ")}`);
          },
        });
      } finally {
        server.kill();
        resend.close();
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

export interface Email {
  to: string;
  subject: string;
  text: string;
}

// The instance that sends email: everything it sent, and a switch that makes
// the stand-in refuse every email with a message, as Resend does.
export interface MailInstance {
  url: string;
  emails: Email[];
  refuse: (message: string | null) => void;
  // The latest email to an address whose subject matches.
  waitForEmail: (to: string, subject: RegExp) => Promise<Email>;
}

// The first link in a plain-text email.
export function linkIn(email: Email): string {
  const match = email.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error(`No link in: ${email.text}`);
  return match[0];
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
