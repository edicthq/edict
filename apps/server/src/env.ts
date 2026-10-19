import { join } from "node:path";
import { DEFAULT_AGENT_LIMITS, type AgentLimits } from "./api/rate-limit.js";
import type { S3Config } from "./storage.js";
import type { WebhookRetry } from "./webhooks.js";

export interface ServerConfig {
  port: number;
  databaseUrl: string;
  // Signs sessions. When unset, the instance generates one on first boot and
  // keeps it in Postgres (see instance.ts).
  authSecret?: string;
  // The public URL Better Auth builds links and checks origins against.
  baseUrl?: string;
  // Reverse proxies (IPs or CIDR ranges) whose X-Forwarded-For is believed.
  // Empty means clients connect directly and the socket address is the IP.
  trustedProxies: string[];
  // The built web app (apps/web/dist). Unset in development, where Vite
  // serves it and proxies /api here.
  webDir?: string;
  // Where attached files are stored (ADR 0020): this directory, unless s3
  // names a bucket.
  dataDir: string;
  s3?: S3Config;
  // The largest file an attachment accepts. DEFAULT_MAX_ATTACHMENT_BYTES
  // otherwise.
  maxAttachmentBytes: number;
  // Background jobs such as the trash purge. On unless JOBS=off; tests run
  // them by hand.
  jobs?: boolean;
  // Outgoing email. Both or neither: without them invites are links to share
  // by hand.
  smtpUrl?: string;
  emailFrom?: string;
  // Better Auth's per-IP rate limit on sign-in and sign-up (three requests
  // over ten seconds by default). Off only for tests that create several
  // users from one address, like the browser end-to-end suite.
  authRateLimit?: boolean;
  // Requests per minute per agent token, and issues per hour per agent.
  agentLimits?: AgentLimits;
  // How webhook deliveries retry. DEFAULT_WEBHOOK_RETRY otherwise; tests
  // shorten it.
  webhookRetry?: WebhookRetry;
  // Lets webhooks point at loopback, private and link-local addresses, like
  // an agent runner on the instance's own network. Off: public addresses only.
  privateWebhookTargets?: boolean;
}

export class ConfigError extends Error {}

// 25 MB each; tunable per instance for big attachments.
export const DEFAULT_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export function readConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new ConfigError("DATABASE_URL is not set");
  }

  const port = readPort(env.PORT);
  if (port === undefined) {
    throw new ConfigError(`PORT is not a valid port number: ${env.PORT}`);
  }

  // Links, cookies and the OAuth issuer follow this URL. Without it they
  // follow each request's Host header, which is fine only in development.
  if (env.NODE_ENV === "production" && !env.BETTER_AUTH_URL) {
    throw new ConfigError("BETTER_AUTH_URL is not set. Set it to the URL people reach Edict at, like https://edict.example.com.");
  }

  const smtpUrl = env.SMTP_URL || undefined;
  const emailFrom = env.EMAIL_FROM || undefined;
  if (smtpUrl && !emailFrom) {
    throw new ConfigError('SMTP_URL is set but EMAIL_FROM is not. Set it to the sender, like "Edict <edict@example.com>".');
  }

  return {
    port,
    databaseUrl: url,
    authSecret: env.BETTER_AUTH_SECRET || undefined,
    baseUrl: env.BETTER_AUTH_URL || undefined,
    trustedProxies: (env.TRUSTED_PROXIES ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    webDir: env.WEB_DIR || undefined,
    // Relative paths resolve against the working directory. Docker passes
    // DATA_DIR=/srv/data with its volume there.
    dataDir: env.DATA_DIR || join(process.cwd(), "data"),
    s3: readS3(env),
    maxAttachmentBytes: readAttachmentMax(env.ATTACHMENT_MAX_BYTES),
    smtpUrl,
    emailFrom,
    authRateLimit: env.AUTH_RATE_LIMIT !== "off",
    jobs: env.JOBS !== "off",
    privateWebhookTargets: env.PRIVATE_WEBHOOK_TARGETS === "allow",
    agentLimits: {
      requestsPerMinute: readLimit("AGENT_REQUESTS_PER_MINUTE", env.AGENT_REQUESTS_PER_MINUTE, DEFAULT_AGENT_LIMITS.requestsPerMinute),
      issuesPerHour: readLimit("AGENT_ISSUES_PER_HOUR", env.AGENT_ISSUES_PER_HOUR, DEFAULT_AGENT_LIMITS.issuesPerHour),
    },
  };
}

// S3_BUCKET turns on S3 storage, and then the credentials must be there too.
function readS3(env: NodeJS.ProcessEnv): S3Config | undefined {
  const bucket = env.S3_BUCKET || undefined;
  if (!bucket) return undefined;
  const accessKeyId = env.S3_ACCESS_KEY_ID || undefined;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY || undefined;
  if (!accessKeyId || !secretAccessKey) {
    throw new ConfigError("S3_BUCKET is set, so S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set too.");
  }
  const endpoint = env.S3_ENDPOINT || undefined;
  if (endpoint && !/^https?:\/\//.test(endpoint)) {
    throw new ConfigError(`S3_ENDPOINT must be a URL, like https://<account>.r2.cloudflarestorage.com: ${endpoint}`);
  }
  return { bucket, region: env.S3_REGION || "us-east-1", endpoint, accessKeyId, secretAccessKey };
}

function readAttachmentMax(raw: string | undefined): number {
  if (raw === undefined || raw === "") {
    return DEFAULT_MAX_ATTACHMENT_BYTES;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`ATTACHMENT_MAX_BYTES is not a positive byte count: ${raw}`);
  }
  return parsed;
}

function readLimit(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`${name} is not a positive whole number: ${raw}`);
  }
  return parsed;
}

function readPort(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") {
    return 3000;
  }

  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : undefined;
}
