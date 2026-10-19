// OAuth discovery for MCP clients (ADR 0021). An MCP client that gets 401 from
// /mcp reads the protected resource metadata, then the authorization server's,
// registers itself and sends its human through the consent page.
import { randomUUID } from "node:crypto";
import type { Context, Hono } from "hono";
import { oauthResource, type Database } from "@edicthq/db";
import { mcpResource, type EdictAuth } from "./auth.js";

export interface OAuthDiscovery {
  // The instance's public URL: configured, else the request's origin.
  originOf: (c: Context) => string;
  // Registers the /mcp resource for an origin with the OAuth provider, once.
  ensureResource: (origin: string) => Promise<void>;
}

// Without a public URL every Host header names a new resource, so only this
// many are registered. Production requires the URL (env.ts).
const MAX_ORIGINS = 20;

export function oauthDiscovery(db: Database, baseUrl: string | undefined): OAuthDiscovery {
  const known = new Set<string>();
  return {
    originOf: (c) => (baseUrl ?? new URL(c.req.url).origin).replace(/\/$/, ""),
    ensureResource: async (origin) => {
      const identifier = mcpResource(origin);
      if (known.has(identifier) || known.size >= MAX_ORIGINS) {
        return;
      }
      // Better Auth's own table, not tenant data.
      await db
        .insert(oauthResource)
        .values({ id: randomUUID(), identifier, name: "Edict MCP", createdAt: new Date(), updatedAt: new Date() })
        .onConflictDoNothing();
      known.add(identifier);
    },
  };
}

// RFC 9728 for /mcp, and RFC 8414 for the provider at /api/auth.
export function oauthRoutes(app: Hono, discovery: OAuthDiscovery, auth: () => EdictAuth | undefined): void {
  const protectedResource = async (c: Context) => {
    const origin = discovery.originOf(c);
    await discovery.ensureResource(origin);
    return c.json({
      resource: mcpResource(origin),
      authorization_servers: [`${origin}/api/auth`],
      bearer_methods_supported: ["header"],
      resource_name: "Edict",
    });
  };
  app.get("/.well-known/oauth-protected-resource", protectedResource);
  app.get("/.well-known/oauth-protected-resource/mcp", protectedResource);

  // Answered by the provider's own endpoint under /api/auth, which takes
  // its URLs from the request when no public URL is configured.
  const authorizationServer = async (c: Context) => {
    const ready = auth();
    if (!ready) {
      return c.json({ error: "starting" }, 503);
    }
    const url = new URL("/api/auth/.well-known/oauth-authorization-server", c.req.url);
    return ready.handler(new Request(url, { headers: c.req.raw.headers }));
  };
  app.get("/.well-known/oauth-authorization-server", authorizationServer);
  app.get("/.well-known/oauth-authorization-server/api/auth", authorizationServer);
}
