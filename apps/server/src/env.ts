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
  };
}

function readPort(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") {
    return 3000;
  }

  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : undefined;
}
