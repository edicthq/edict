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
  options: { database?: TestDatabase; authSecret?: string; trustedProxies?: string[]; webDir?: string } = {},
): Promise<TestServer> {
  const database = options.database ?? (await createTestDatabase());
  const app = createApp({
    port: 0,
    databaseUrl: database.url,
    authSecret: options.authSecret,
    trustedProxies: options.trustedProxies ?? [],
    webDir: options.webDir,
  });
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

export interface ApiResponse<T = any> {
  status: number;
  body: T;
}

// A caller of /api/v1, signed in when given a cookie.
export function apiClient(baseUrl: string, cookie?: string) {
  const call = async <T = any>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> => {
    const headers: Record<string, string> = {};
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  };
  return {
    get: <T = any>(path: string) => call<T>("GET", path),
    post: <T = any>(path: string, body?: unknown) => call<T>("POST", path, body ?? {}),
    patch: <T = any>(path: string, body: unknown) => call<T>("PATCH", path, body),
    delete: <T = any>(path: string) => call<T>("DELETE", path),
  };
}

export type ApiClient = ReturnType<typeof apiClient>;

// Signs a new user up and returns an API client acting as them.
export async function signUpAs(
  baseUrl: string,
  name: string,
  email = `${name.toLowerCase()}@example.com`,
): Promise<ApiClient> {
  const res = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, email, password: "correct-horse-battery" }),
  });
  if (res.status !== 200) {
    throw new Error(`sign-up failed for ${email}: ${res.status} ${await res.text()}`);
  }
  return apiClient(baseUrl, cookieHeader(res));
}
