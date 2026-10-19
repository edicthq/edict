import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";
import { Pool } from "pg";
import { createApp, type App } from "../app.js";
import { DEFAULT_MAX_ATTACHMENT_BYTES, type SignInProviders } from "../env.js";
import type { Mailer } from "../email.js";
import type { AgentLimits } from "../api/rate-limit.js";
import type { WebhookRetry } from "../webhooks.js";
import type { S3Config } from "../storage.js";

export interface TestDatabase {
  url: string;
}

export interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
  purgeTrash: App["purgeTrash"];
  archiveIssues: App["archiveIssues"];
  sendTelemetry: App["sendTelemetry"];
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
  options: {
    database?: TestDatabase;
    authSecret?: string;
    trustedProxies?: string[];
    webDir?: string;
    mailer?: Mailer;
    // Where attachments are stored (ADR 0020). A fresh directory each test.
    dataDir?: string;
    // Store attachments in this bucket instead of dataDir.
    s3?: S3Config;
    // The attachment size limit. Defaults to production's.
    maxAttachmentBytes?: number;
    // Start pg-boss and its schedules. Off: tests call app.purgeTrash.
    jobs?: boolean;
    // Agents' rate limits. Production's by default.
    agentLimits?: AgentLimits;
    // How webhook deliveries retry. Production's by default.
    webhookRetry?: WebhookRetry;
    // Let webhooks reach private addresses, like the tests' 127.0.0.1 receivers.
    privateWebhookTargets?: boolean;
    signIn?: SignInProviders;
    // Where the update check asks for the latest release. Nowhere real.
    releasesUrl?: string;
    // Where telemetry pings go. Nowhere real.
    telemetryUrl?: string;
  } = {},
): Promise<TestServer> {
  const database = options.database ?? (await createTestDatabase());
  const dataDir = options.dataDir ?? (await mkdtemp(join(tmpdir(), "edict-files-")));
  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));
  const app = createApp({
    port: 0,
    databaseUrl: database.url,
    authSecret: options.authSecret,
    trustedProxies: options.trustedProxies ?? [],
    webDir: options.webDir,
    dataDir,
    s3: options.s3,
    maxAttachmentBytes: options.maxAttachmentBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES,
    jobs: options.jobs ?? false,
    agentLimits: options.agentLimits,
    webhookRetry: options.webhookRetry,
    privateWebhookTargets: options.privateWebhookTargets,
    signIn: options.signIn,
    releasesUrl: options.releasesUrl ?? "http://127.0.0.1:9/releases/latest",
    telemetryUrl: options.telemetryUrl ?? "http://127.0.0.1:9/v1/ping",
  }, { mailer: options.mailer });
  await app.start();

  let closed = false;
  const close = async () => {
    if (!closed) {
      closed = true;
      await app.shutdown();
    }
  };
  onTestFinished(close);

  return { baseUrl: `http://127.0.0.1:${app.port}`, close, purgeTrash: app.purgeTrash, archiveIssues: app.archiveIssues, sendTelemetry: app.sendTelemetry };
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
  headers: Headers;
}

// A caller of /api/v1, signed in when given a cookie.
export function apiClient(baseUrl: string, cookie?: string) {
  const headers = (): Record<string, string> => (cookie ? { cookie } : {});
  const call = async <T = any>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> => {
    const send: Record<string, string> = headers();
    if (body !== undefined) send["content-type"] = "application/json";
    const res = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: send,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined, headers: res.headers };
  };
  const callForm = async <T = any>(method: string, path: string, form: FormData): Promise<ApiResponse<T>> => {
    const res = await fetch(`${baseUrl}/api/v1${path}`, { method, headers: headers(), body: form });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined, headers: res.headers };
  };
  return {
    get: <T = any>(path: string) => call<T>("GET", path),
    post: <T = any>(path: string, body?: unknown) => call<T>("POST", path, body ?? {}),
    postForm: <T = any>(path: string, form: FormData) => callForm<T>("POST", path, form),
    patch: <T = any>(path: string, body: unknown) => call<T>("PATCH", path, body),
    delete: <T = any>(path: string) => call<T>("DELETE", path),
    // The signed-in session cookie, for calls outside /api/v1.
    cookie,
    baseUrl,
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
