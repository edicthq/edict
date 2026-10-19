// Edict's telemetry collector (ADR 0026). Instances that opted in send one
// ping a day: their version and a user-count bucket. The collector keeps only
// how many pings arrived per day, version and bucket. It stores no address and
// no time finer than the day, and logs no requests.
import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type pg from "pg";
import { TelemetryPing } from "@edicthq/schema";

export interface CollectorOptions {
  pool: pg.Pool;
  port: number;
  // The clock, so tests can ping on other days.
  now?: () => Date;
}

// How far back GET /v1/stats reaches.
const STATS_DAYS = 90;

export function createCollector({ pool, now = () => new Date() }: Omit<CollectorOptions, "port">): Hono {
  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));

  app.post(
    "/v1/ping",
    bodyLimit({ maxSize: 1024, onError: (c) => c.json({ error: "The ping is too large" }, 400) }),
    async (c) => {
      const body = await c.req.json().catch(() => undefined);
      const ping = TelemetryPing.safeParse(body);
      if (!ping.success) return c.json({ error: "A ping is {version, users} and nothing else" }, 400);
      await pool.query(
        `INSERT INTO pings (day, version, users, pings) VALUES ($1::timestamptz AT TIME ZONE 'UTC', $2, $3, 1)
         ON CONFLICT (day, version, users) DO UPDATE SET pings = pings.pings + 1`,
        [now().toISOString(), ping.data.version, ping.data.users],
      );
      return c.body(null, 204);
    },
  );

  // Public: daily counts say nothing about any one instance.
  app.get("/v1/stats", async (c) => {
    const { rows } = await pool.query<{ day: string; version: string; users: string; pings: number }>(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, version, users, pings FROM pings
       WHERE day > ($1::timestamptz AT TIME ZONE 'UTC')::date - $2::int
       ORDER BY day DESC, version, users`,
      [now().toISOString(), STATS_DAYS],
    );
    return c.json({ days: rows });
  });

  return app;
}

export async function migrate(pool: pg.Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS pings (
    day date NOT NULL,
    version text NOT NULL,
    users text NOT NULL,
    pings integer NOT NULL,
    PRIMARY KEY (day, version, users)
  )`);
}

export async function startCollector(options: CollectorOptions): Promise<{ port: number; close: () => Promise<void> }> {
  await migrate(options.pool);
  const app = createCollector(options);
  const server = await new Promise<ServerType>((resolve) => {
    const s = serve({ fetch: app.fetch, port: options.port }, () => resolve(s));
  });
  const address = server.address();
  return {
    port: typeof address === "object" && address ? address.port : options.port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
