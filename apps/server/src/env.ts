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
  // Outgoing email. Both or neither: without them invites are links to share
  // by hand.
  smtpUrl?: string;
  emailFrom?: string;
  // Better Auth's per-IP rate limit on sign-in and sign-up (three requests
  // over ten seconds by default). Off only for tests that create several
  // users from one address, like the browser end-to-end suite.
  authRateLimit?: boolean;
}

export class ConfigError extends Error {}

export function readConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new ConfigError("DATABASE_URL is not set");
  }

  const port = readPort(env.PORT);
  if (port === undefined) {
    throw new ConfigError(`PORT is not a valid port number: ${env.PORT}`);
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
    smtpUrl,
    emailFrom,
    authRateLimit: env.AUTH_RATE_LIMIT !== "off",
  };
}

function readPort(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") {
    return 3000;
  }

  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : undefined;
}
