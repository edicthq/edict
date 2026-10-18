import { createHash, randomBytes } from "node:crypto";
import { expect } from "vitest";
import type { ApiClient } from "./server.js";

const REDIRECT = "http://127.0.0.1:33418/callback";

// What an MCP client does to connect (ADR 0021): discover the provider,
// register, send its human through consent with PKCE, trade the code for
// tokens. `human` is the signed-in browser of the person approving.
export async function connect(
  baseUrl: string,
  human: ApiClient,
  orgId: string | null,
  clientName = "Claude Code",
): Promise<{ accessToken: string; refreshToken: string; clientId: string }> {
  const resource = await fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp`).then((r): Promise<any> => r.json());
  expect(resource.resource).toBe(`${baseUrl}/mcp`);
  const issuer = new URL(resource.authorization_servers[0]);
  const server = await fetch(`${issuer.origin}/.well-known/oauth-authorization-server${issuer.pathname}`).then((r): Promise<any> => r.json());

  const registered = await fetch(server.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  expect(registered.status).toBe(201);
  const clientId = ((await registered.json()) as { client_id: string }).client_id;

  const verifier = randomBytes(32).toString("base64url");
  const authorize = new URL(server.authorization_endpoint);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    scope: "openid offline_access",
    state: "xyz",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    resource: resource.resource,
  }).toString();
  const toConsent = await fetch(authorize, { headers: { cookie: human.cookie! }, redirect: "manual" });
  // A redirect, or JSON naming where to go when the request accepts it.
  const location =
    toConsent.status === 302 ? toConsent.headers.get("location") : ((await toConsent.json()) as { url?: string }).url;
  expect(location).toBeTruthy();
  const consentPage = new URL(location!, baseUrl);
  expect(consentPage.pathname).toBe("/oauth/consent");

  // The consent page: choose the organization, continue, then accept.
  if (orgId) {
    expect((await human.post("/oauth/organization", { orgId })).status).toBe(200);
  }
  const authJson = async (path: string, body: unknown) => {
    const res = await fetch(`${baseUrl}/api/auth${path}`, {
      method: "POST",
      headers: { cookie: human.cookie!, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as any };
  };
  const continued = await authJson("/oauth2/continue", { postLogin: true, oauth_query: consentPage.search.slice(1) });
  expect(continued.status, JSON.stringify(continued.body)).toBe(200);
  const consentStep = new URL(continued.body.url ?? continued.body.redirect_uri, baseUrl);
  const consent = await authJson("/oauth2/consent", { accept: true, oauth_query: consentStep.search.slice(1) });
  const consented = consent.body;
  if (consent.status !== 200) {
    throw new ConsentError(consent.status, consented);
  }
  const code = new URL(consented.url ?? consented.redirect_uri).searchParams.get("code")!;

  const token = await fetch(server.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
      resource: resource.resource,
    }),
  });
  const tokens = (await token.json()) as any;
  expect(token.status, JSON.stringify(tokens)).toBe(200);
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, clientId };
}

class ConsentError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super(`consent failed: ${status} ${JSON.stringify(body)}`);
  }
}
