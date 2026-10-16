import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { createDatabase, createPool, migrateToLatest } from "@edicthq/db";
import { createAuth, type EdictAuth } from "./auth.js";
import type { ServerConfig } from "./env.js";
import { instanceAuthSecret } from "./instance.js";

export interface App {
  app: Hono;
  // The bound port. config.port is respected; port 0 binds an ephemeral port
  // (used by tests). 0 before start().
  port: number;
  // Resolves once migrations have run and the HTTP server accepts requests.
  start: () => Promise<void>;
  shutdown: () => Promise<void>;
}

export function createApp(config: ServerConfig): App {
  const pool = createPool(config.databaseUrl);
  const db = createDatabase(pool);

  // Built in start(): the auth secret may live in the database.
  let auth: EdictAuth | undefined;

  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
  app.on(["POST", "GET"], "/api/auth/*", (c) =>
    auth ? auth.handler(c.req.raw) : c.json({ error: "starting" }, 503),
  );

  let server: ServerType | undefined;
  let poolEnded = false;

  const state: App = {
    app,
    port: 0,
    start: async () => {
      await migrateToLatest(pool);
      const secret = config.authSecret ?? (await instanceAuthSecret(db));
      auth = createAuth({ secret, baseURL: config.baseUrl }, db);

      server = await listen(app, config.port);
      state.port = boundPort(server);
    },
    shutdown: async () => {
      if (server) {
        const closing = server;
        server = undefined;
        await new Promise<void>((resolve) => closing.close(() => resolve()));
      }
      if (!poolEnded) {
        poolEnded = true;
        await pool.end();
      }
    },
  };

  return state;
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
