import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createApp } from "../app.js";
import type { App } from "../app.js";

export interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

// Boots a server against a throwaway Postgres database: migrations on boot,
// auth enabled with a fixed test secret.
export async function startTestServer(): Promise<TestServer> {
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) {
    throw new Error("DATABASE_URL is not set; run the vitest global setup");
  }

  const dbName = randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const base = new URL(adminUrl);
  const databaseUrl = `${base.protocol}//${base.username}:${base.password}@${base.hostname}${base.port ? `:${base.port}` : ""}/${dbName}`;

  const app: App = createApp(
    { port: 0, databaseUrl },
    { auth: { secret: "test-secret do not reuse", baseURL: "http://localhost:3000" } },
  );
  await app.start();

  return {
    baseUrl: `http://127.0.0.1:${app.port}`,
    close: async () => {
      await app.shutdown();
      await dropDatabase(adminUrl, dbName);
    },
  };
}

async function dropDatabase(adminUrl: string, dbName: string): Promise<void> {
  const admin = new Pool({ connectionString: adminUrl });
  try {
    await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}

// Collect cookies from a fetch response as a Cookie header for the next one.
export function cookieHeader(response: Response): string {
  return response.headers.getSetCookie().map((entry) => entry.split(";")[0]).join("; ");
}
