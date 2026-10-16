import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export { Pool };
export type Database = ReturnType<typeof drizzle<typeof schema>>;

const DEFAULT_LOCK_KEY = "742793001015";

export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Point it at a Postgres instance that Edict can use alone.");
  }
  return url;
}

export function createPool(url: string): Pool {
  return new Pool({ connectionString: url, max: 10 });
}

export function createDatabase(pool: Pool) {
  return drizzle(pool, { schema });
}

// Every replica runs migrations on boot behind a Postgres advisory lock, so
// several containers starting together serialize instead of racing.
export async function migrateToLatest(pool: Pool, lockKey = DEFAULT_LOCK_KEY): Promise<void> {
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const client = await pool.connect();
  try {
    await client.query(`SELECT pg_advisory_lock(${lockKey})`);
    try {
      await migrate(drizzle(client), { migrationsFolder: migrationsFolder() });
    } finally {
      await client.query(`SELECT pg_advisory_unlock(${lockKey})`);
    }
  } finally {
    client.release();
  }
}

// dist/index.js loads dist/migrations with it, so the shipped package carries
// its own SQL migrations.
function migrationsFolder(): string {
  return join(import.meta.dirname, "migrations");
}
