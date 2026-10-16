import { randomUUID } from "node:crypto";
import { onTestFinished } from "vitest";
import { Pool } from "pg";
import { createApp } from "../app.js";

export interface TestDatabase {
  url: string;
}

export interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

// A throwaway Postgres database, dropped when the current test finishes.
export async function createTestDatabase(): Promise<TestDatabase> {
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) {
    throw new Error("DATABASE_URL is not set; run the vitest global setup");
  }

  const dbName = randomUUID().replaceAll("-", "");
  await adminQuery(adminUrl, `CREATE DATABASE "${dbName}"`);
  onTestFinished(() => adminQuery(adminUrl, `DROP DATABASE "${dbName}" WITH (FORCE)`));

  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  return { url: url.toString() };
}

// Boots a server the way production does (migrations on boot, no auth secret
// configured) and shuts it down when the current test finishes. Pass a
// database to run several servers against the same data.
export async function startTestServer(
  options: { database?: TestDatabase; authSecret?: string } = {},
): Promise<TestServer> {
  const database = options.database ?? (await createTestDatabase());
  const app = createApp({ port: 0, databaseUrl: database.url, authSecret: options.authSecret });
  await app.start();

  let closed = false;
  const close = async () => {
    if (!closed) {
      closed = true;
      await app.shutdown();
    }
  };
  onTestFinished(close);

  return { baseUrl: `http://127.0.0.1:${app.port}`, close };
}

async function adminQuery(adminUrl: string, sql: string): Promise<void> {
  const admin = new Pool({ connectionString: adminUrl });
  try {
    await admin.query(sql);
  } finally {
    await admin.end();
  }
}

// Collect cookies from a fetch response as a Cookie header for the next one.
export function cookieHeader(response: Response): string {
  return response.headers.getSetCookie().map((entry) => entry.split(";")[0]).join("; ");
}
