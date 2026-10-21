// ADR 0021: every request becomes one caller, whatever credential it carried.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import {
  apiKeys,
  emit,
  enterOrg,
  members,
  oauthAccessToken,
  oauthClient,
  onBehalfOf,
  user,
  type Scope,
  type Transaction,
} from "@edicthq/db";
import type { Role } from "@edicthq/schema";
import { hashOAuthToken, OAUTH_ACCESS_TOKEN_PREFIX } from "../auth.js";
import { atLeast, callerMember, type MemberRow } from "./access.js";
import { ApiError, forbidden, notFound } from "./errors.js";

export interface SessionUser {
  id: string;
  // The Better Auth session the request came with.
  sessionId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  instanceAdmin: boolean;
}

export type Credential =
  | { kind: "session"; user: SessionUser }
  // The SHA-256 hash of an API key's secret.
  | { kind: "apiKey"; hash: string }
  // The hash of an OAuth access token, as the provider stores it.
  | { kind: "oauth"; hash: string };

// The member acting, and what limits it.
export interface Caller extends MemberRow {
  // Whose team access applies: the caller itself, or a connected agent's human.
  access: MemberRow;
  // An API key's teams, narrowing the access further. Null: no narrowing.
  keyTeamIds: string[] | null;
}

export const API_KEY_PREFIX = "edict_ak_";

// The credential a request carries: a bearer API key, else the session.
export function credentialOf(headers: Headers, user: SessionUser | null): Credential | null {
  const bearer = /^Bearer\s+(\S+)$/i.exec(headers.get("authorization") ?? "")?.[1];
  if (bearer?.startsWith(API_KEY_PREFIX)) {
    return { kind: "apiKey", hash: hashSecret(bearer) };
  }
  if (bearer?.startsWith(OAUTH_ACCESS_TOKEN_PREFIX)) {
    return { kind: "oauth", hash: hashOAuthToken(bearer.slice(OAUTH_ACCESS_TOKEN_PREFIX.length)) };
  }
  return user ? { kind: "session", user } : null;
}

// The scope settings a credential needs before its organization is known.
export function scopeFor(credential: Credential): Scope {
  switch (credential.kind) {
    case "session":
      return { userId: credential.user.id };
    case "apiKey":
      return { apiKeyHash: credential.hash };
    case "oauth":
      return { oauthTokenHash: credential.hash };
  }
}

// The caller in the scoped organization. Outsiders get 404, so they cannot tell
// whether the organization exists.
export async function callerIn(tx: Transaction, orgId: string, credential: Credential): Promise<Caller> {
  if (credential.kind === "session") {
    const member = await callerMember(tx, orgId, credential.user.id);
    return { ...member, access: member, keyTeamIds: null };
  }
  if (credential.kind === "oauth") {
    const grant = await grantByHash(tx, credential.hash);
    if (grant.orgId !== orgId) {
      throw notFound("organization");
    }
    return connectedCaller(tx, grant);
  }
  const key = await keyByHash(tx, credential.hash);
  if (key.orgId !== orgId) {
    throw notFound("organization");
  }
  return agentCaller(tx, key);
}

// The organization an agent credential belongs to, for requests that name none.
export async function credentialOrg(tx: Transaction, credential: Credential): Promise<string | null> {
  switch (credential.kind) {
    case "session":
      return null;
    case "apiKey":
      return (await keyByHash(tx, credential.hash)).orgId;
    case "oauth":
      return (await grantByHash(tx, credential.hash)).orgId;
  }
}

type ApiKeyRow = typeof apiKeys.$inferSelect;

async function keyByHash(tx: Transaction, hash: string): Promise<ApiKeyRow> {
  const [key] = await tx
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.tokenHash, hash), isNull(apiKeys.revokedAt)));
  if (!key) {
    throw invalidKey();
  }
  return key;
}

async function agentCaller(tx: Transaction, key: ApiKeyRow): Promise<Caller> {
  await enterOrg(tx, key.orgId);
  const [agent] = await tx
    .select()
    .from(members)
    .where(and(eq(members.orgId, key.orgId), eq(members.id, key.agentId), isNull(members.removedAt), isNull(members.pausedAt)));
  if (!agent) {
    throw invalidKey();
  }
  // At most once a minute, so a busy agent does not write on every request.
  await tx
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, key.id),
        or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, new Date(Date.now() - 60_000))),
      ),
    );
  return { ...agent, access: agent, keyTeamIds: key.teamIds };
}

interface Grant {
  orgId: string;
  userId: string;
  clientName: string;
}

// The OAuth grant behind an access token: who approved which client, for
// which organization.
async function grantByHash(tx: Transaction, hash: string): Promise<Grant> {
  const [token] = await tx
    .select({ orgId: oauthAccessToken.referenceId, userId: oauthAccessToken.userId, clientName: oauthClient.name })
    .from(oauthAccessToken)
    .leftJoin(oauthClient, eq(oauthClient.clientId, oauthAccessToken.clientId))
    .where(and(eq(oauthAccessToken.token, hash), isNull(oauthAccessToken.revoked), gt(oauthAccessToken.expiresAt, new Date())));
  if (!token?.orgId || !token.userId) {
    throw new ApiError("unauthorized", "The access token is not valid. It may have expired, or its agent was paused. Reconnect the MCP client.");
  }
  return { orgId: token.orgId, userId: token.userId, clientName: clientNameOf(token.clientName) };
}

// What a connected agent is called after: the client's registered name,
// without a trailing parenthesis. Claude Code registers as "Claude Code
// (<server name>)", which would name the agent "Claude Code (edict)
// (Amirali)" and make each server name a different client. Keep in step with
// revokeGrants.
export function clientNameOf(name: string | null): string {
  return name?.replace(/\s*\([^()]*\)\s*$/, "").trim() || "MCP client";
}

// A connected agent can never be more than a Member (ADR 0021).
function connectedRole(human: Role): "member" | "guest" {
  return human === "guest" ? "guest" : "member";
}

// The connected agent for an OAuth grant, created on its first request
// (ADR 0015). It acts on behalf of its human and sees what they see.
async function connectedCaller(tx: Transaction, grant: Grant): Promise<Caller> {
  await enterOrg(tx, grant.orgId);
  const [human] = await tx
    .select()
    .from(members)
    .where(and(eq(members.orgId, grant.orgId), eq(members.userId, grant.userId), isNull(members.removedAt)));
  if (!human) {
    throw new ApiError("unauthorized", "The person who connected this client is no longer a member of the organization.");
  }
  const role = connectedRole(human.role);
  const find = () =>
    tx
      .select()
      .from(members)
      .where(and(eq(members.orgId, grant.orgId), eq(members.connectedBy, human.id), eq(members.clientName, grant.clientName)));
  let [agent] = await find();
  if (!agent) {
    const [person] = await tx.select({ name: user.name }).from(user).where(eq(user.id, grant.userId));
    const firstName = person?.name.trim().split(/\s+/)[0] || "someone";
    const name = `${grant.clientName} (${firstName})`;
    // Two first requests at once: one inserts, the other finds its row.
    const [created] = await tx
      .insert(members)
      .values({ orgId: grant.orgId, kind: "agent", role, name, connectedBy: human.id, clientName: grant.clientName })
      .onConflictDoNothing()
      .returning();
    if (created) {
      await emit(tx, grant.orgId, {
        type: "agent.connected",
        actorId: created.id,
        onBehalfOfId: human.id,
        subjectId: created.id,
        data: { name, clientName: grant.clientName, role },
      });
    }
    [agent] = created ? [created] : await find();
  }
  if (!agent || agent.removedAt) {
    throw new ApiError("unauthorized", "This connection's agent was removed. Reconnect the MCP client.");
  }
  if (agent.pausedAt) {
    throw forbidden(`${agent.name} is paused. An admin can resume it under Settings, Agents.`);
  }
  await onBehalfOf(tx, human.id);
  return { ...agent, role: atLeast(agent.role, role) ? role : agent.role, access: human, keyTeamIds: null };
}

function invalidKey() {
  return new ApiError("unauthorized", "The API key is not valid. It may have been revoked, or its agent paused.");
}

// A new API key's secret and what is stored of it.
export function newApiKey(): { secret: string; prefix: string; hash: string } {
  const secret = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { secret, prefix: secret.slice(0, API_KEY_PREFIX.length + 6), hash: hashSecret(secret) };
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}
