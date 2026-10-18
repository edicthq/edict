// ADR 0021: every request becomes one caller, whatever credential it carried.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { apiKeys, enterOrg, members, type Scope, type Transaction } from "@edicthq/db";
import type { MemberRow } from "./access.js";
import { callerMember } from "./access.js";
import { ApiError, notFound } from "./errors.js";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  instanceAdmin: boolean;
}

export type Credential =
  | { kind: "session"; user: SessionUser }
  // The SHA-256 hash of an API key's secret.
  | { kind: "apiKey"; hash: string };

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
  return user ? { kind: "session", user } : null;
}

// The scope settings a credential needs before its organization is known.
export function scopeFor(credential: Credential): Scope {
  return credential.kind === "session" ? { userId: credential.user.id } : { apiKeyHash: credential.hash };
}

// The caller in the scoped organization. Outsiders get 404, so they cannot tell
// whether the organization exists.
export async function callerIn(tx: Transaction, orgId: string, credential: Credential): Promise<Caller> {
  if (credential.kind === "session") {
    const member = await callerMember(tx, orgId, credential.user.id);
    return { ...member, access: member, keyTeamIds: null };
  }
  const key = await keyByHash(tx, credential.hash);
  if (key.orgId !== orgId) {
    throw notFound("organization");
  }
  return agentCaller(tx, key);
}

// The organization an agent credential belongs to, for requests that name none.
export async function credentialOrg(tx: Transaction, credential: Credential): Promise<string | null> {
  if (credential.kind === "session") {
    return null;
  }
  return (await keyByHash(tx, credential.hash)).orgId;
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
