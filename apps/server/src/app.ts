import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import {
  createDatabase,
  createPool,
  migrateToLatest,
  type Database,
  type Pool,
} from "@edict/db";
import { createAuth, type AuthConfig, type EdictAuth } from "./auth.js";
import type { ServerConfig } from "./env.js";

export interface App {
  app: Hono;
  // The bound port. config.port is respected; port 0 binds an ephemeral port
  // (used by tests). 0 before start().
  port: number;
  // Resolves once migrations have run and the HTTP server accepts requests.
  start: () => Promise<void>;
  shutdown: () => Promise<void>;
}

export interface AppOptions {
  auth?: AuthConfig;
  server?: ServerType;
}

export function createApp(config: ServerConfig, options: AppOptions = {}): App {
  const pool: Pool = createPool(config.databaseUrl);
  const db: Database = createDatabase(pool);

  let auth: EdictAuth | undefined;
  if (options.auth) {
    auth = createAuth(options.auth, db);
  }

  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
  if (auth) {
    app.on(["POST", "GET"], "/api/auth/*", (c) => auth!.handler(c.req.raw));
  }

  let server: ServerType | undefined = options.server;
  let migrated = false;

  const state: App = {
    app,
    port: 0,
    start: async () => {
      await migrateToLatest(pool);
      migrated = true;

      if (!server) {
        server = await listen(app, config.port);
      }
      state.port = boundPort(server);
    },
    shutdown: async () => {
      await new Promise<void>((resolve) => {
        if (!server) {
          resolve();
          return;
        }
        server.close(() => resolve());
      });
      if (migrated) {
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
