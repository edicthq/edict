import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import {
  createDatabase,
  createPool,
  migrateToLatest,
  type Database,
  type Pool,
} from "@edict/db";
import type { ServerConfig } from "./env.js";

export interface App {
  app: Hono;
  // Resolves once migrations have run and the HTTP server accepts requests.
  start: () => Promise<void>;
  shutdown: () => Promise<void>;
}

interface AppOptions {
  server?: ServerType;
}

export function createApp(config: ServerConfig, options: AppOptions = {}): App {
  const pool: Pool = createPool(config.databaseUrl);
  const db: Database = createDatabase(pool);
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  let server: ServerType | undefined = options.server;
  let migrated = false;

  return {
    app,
    start: async () => {
      await migrateToLatest(pool);
      migrated = true;

      server =
        server ?? serve({ fetch: app.fetch, port: config.port }, (info) => {
          console.log(`edict listening on http://localhost:${info.port}`);
        });

      return void server;
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
}
