import { serve, type ServerType } from "@hono/node-server";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { createDatabase, createPool, migrateToLatest } from "@edicthq/db";
import { consentOrganization, createApi, fileRoutes } from "./api/index.js";
import { DEFAULT_AGENT_LIMITS, RequestLimiter } from "./api/rate-limit.js";
import { createAuth, type EdictAuth } from "./auth.js";
import { createSmtpMailer, type Mailer } from "./email.js";
import type { ServerConfig } from "./env.js";
import { ensureInstanceSettings } from "./instance.js";
import { mcpRoutes } from "./mcp/index.js";
import { oauthDiscovery, oauthRoutes } from "./oauth.js";
import { purgeTrash, startJobs, type PurgeResult } from "./jobs.js";
import { localDiskStorage, s3Storage } from "./storage.js";

export interface App {
  app: Hono;
  // The bound port. config.port is respected; port 0 binds an ephemeral port
  // (used by tests). 0 before start().
  port: number;
  // Resolves once migrations have run and the HTTP server accepts requests.
  start: () => Promise<void>;
  shutdown: () => Promise<void>;
  // The daily trash purge, run now as if at `now`. Tests use it.
  purgeTrash: (now?: Date) => Promise<PurgeResult>;
}

export interface AppOptions {
  // Overrides the SMTP mailer from config. Tests pass one that records.
  mailer?: Mailer;
}

export function createApp(config: ServerConfig, options: AppOptions = {}): App {
  const pool = createPool(config.databaseUrl);
  const db = createDatabase(pool);
  const mailer =
    options.mailer ??
    (config.smtpUrl && config.emailFrom ? createSmtpMailer(config.smtpUrl, config.emailFrom) : undefined);

  // Built in start(): the auth secret may live in the database.
  let auth: EdictAuth | undefined;

  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
  app.on(["POST", "GET"], "/api/auth/*", (c) =>
    auth ? auth.handler(withClientIp(c, config.trustedProxies)) : c.json({ error: "starting" }, 503),
  );
  const agentLimits = config.agentLimits ?? DEFAULT_AGENT_LIMITS;
  const deps = {
    db,
    mailer,
    publicUrl: config.baseUrl,
    // Attached files (ADR 0020): a bucket when one is configured, else disk.
    maxAttachmentBytes: config.maxAttachmentBytes,
    agentLimits,
    requestLimiter: new RequestLimiter(agentLimits.requestsPerMinute),
    storage: config.s3 ? s3Storage(config.s3) : localDiskStorage(config.dataDir),
    getUser: async (headers: Headers) => {
      const session = await auth?.api.getSession({ headers });
      if (!session) {
        return null;
      }
      const { id, email, name, role, emailVerified } = session.user;
      return { id, sessionId: session.session.id, email, name, emailVerified, instanceAdmin: role === "admin" };
    },
  };
  app.route("/api/v1", createApi(deps));
  const discovery = oauthDiscovery(db, config.baseUrl);
  oauthRoutes(app, discovery, () => auth);
  mcpRoutes(app, discovery);
  // Attachment bytes live under /files, not /api/v1 (ADR 0020). The default
  // resolver uses cookies; use e.g. `curl -b` or an Authorization header.
  app.route("/", fileRoutes(deps));

  if (config.webDir) {
    serveWeb(app, config.webDir);
  }

  let server: ServerType | undefined;
  let jobs: Awaited<ReturnType<typeof startJobs>> | undefined;
  let poolEnded = false;

  const state: App = {
    app,
    port: 0,
    start: async () => {
      await migrateToLatest(pool);
      await deps.storage.check();
      const settings = await ensureInstanceSettings(db);
      auth = createAuth(
        {
          secret: config.authSecret ?? settings.authSecret,
          baseURL: config.baseUrl,
          trustedProxies: config.trustedProxies,
          rateLimit: config.authRateLimit === false ? false : undefined,
        },
        db,
        mailer,
        (userId, orgId) => consentOrganization(db, userId, orgId),
      );

      if (config.jobs !== false) {
        jobs = await startJobs(config.databaseUrl, db, deps.storage);
      }

      server = await listen(app, config.port);
      state.port = boundPort(server);
    },
    purgeTrash: (now) => purgeTrash(db, deps.storage, now),
    shutdown: async () => {
      if (server) {
        const closing = server;
        server = undefined;
        await new Promise<void>((resolve) => closing.close(() => resolve()));
      }
      if (jobs) {
        const stopping = jobs;
        jobs = undefined;
        await stopping.stop({ graceful: true });
      }
      if (!poolEnded) {
        poolEnded = true;
        await pool.end();
      }
    },
  };

  return state;
}

// The built web app. Hashed files under /assets cache forever; every other
// path that is not a file gets index.html, so the client router handles it.
function serveWeb(app: Hono, root: string): void {
  const indexHtml = readFileSync(join(root, "index.html"), "utf8");
  const files = serveStatic({ root });

  app.use("/assets/*", async (c, next) => {
    await next();
    if (c.res.ok) {
      c.header("cache-control", "public, max-age=31536000, immutable");
    }
  });
  app.get("/assets/*", files);
  app.get("*", async (c, next) => {
    const path = c.req.path;
    if (path.startsWith("/api/") || path === "/health") {
      return next();
    }
    if (extname(path)) {
      return files(c, next);
    }
    c.header("cache-control", "no-cache");
    return c.html(indexHtml);
  });
}

// Better Auth rate-limits by client IP and reads it from X-Forwarded-For. A
// client can send that header itself, so the socket address goes last: with
// no trusted proxies it replaces the header, and with trusted proxies Better
// Auth walks the chain from the right, skipping them, so a client that
// bypasses the proxy is still seen by its own address.
function withClientIp(c: Context, trustedProxies: string[]): Request {
  const socket = getConnInfo(c).remote.address;
  const headers = new Headers(c.req.raw.headers);
  const forwarded = headers.get("x-forwarded-for");
  if (!socket) {
    headers.delete("x-forwarded-for");
  } else if (trustedProxies.length > 0 && forwarded) {
    headers.set("x-forwarded-for", `${forwarded}, ${socket}`);
  } else {
    headers.set("x-forwarded-for", socket);
  }
  return new Request(c.req.raw, { headers });
}

function listen(app: Hono, port: number): Promise<ServerType> {
  return new Promise((resolve) => {
    const s = serve({ fetch: app.fetch, port }, (info) => {
      console.log(`edict listening on http://localhost:${info.port}`);
      resolve(s);
    });
  });
}

function boundPort(server: ServerType): number {
  const address = server.address();
  if (typeof address === "object" && address) {
    return address.port;
  }
  return 0;
}
