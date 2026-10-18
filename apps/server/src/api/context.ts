import { OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { sql } from "drizzle-orm";
import { inScope, type Database, type Transaction } from "@edicthq/db";
import { ErrorResponse, Id, type ErrorCode } from "@edicthq/schema";
import type { Mailer } from "../email.js";
import { callerIn, credentialOf, scopeFor, type Caller, type Credential, type SessionUser } from "./callers.js";
import { errorResponse, forbidden, onApiError, unauthorized } from "./errors.js";

export type { Caller, Credential, SessionUser } from "./callers.js";

export interface ApiDeps {
  db: Database;
  getUser: (headers: Headers) => Promise<SessionUser | null>;
  // Unset when the instance has no email set up.
  mailer?: Mailer;
  // Where links in responses point. Defaults to the request's origin.
  publicUrl?: string;
}

export type ApiEnv = { Variables: { user: SessionUser | null; credential: Credential | null } };

// Reads who is calling: an API key, else the session (ADR 0021).
export function identify(deps: Pick<ApiDeps, "getUser">) {
  return async (c: Context<ApiEnv>, next: () => Promise<void>) => {
    const user = await deps.getUser(c.req.raw.headers);
    const credential = credentialOf(c.req.raw.headers, user);
    c.set("credential", credential);
    c.set("user", credential?.kind === "session" ? credential.user : null);
    await next();
  };
}

export function router() {
  const app = new OpenAPIHono<ApiEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return errorResponse(c, "invalid_request", z.prettifyError(result.error));
      }
    },
  });
  app.onError(onApiError);
  return app;
}

// The signed-in person, for what only people do: agents get 403.
export function signedIn(c: Context<ApiEnv>): SessionUser {
  const user = c.get("user");
  if (!user) {
    if (c.get("credential")) {
      throw forbidden("Agents cannot do this. It needs a person signed in to Edict.");
    }
    throw unauthorized();
  }
  return user;
}

export function credential(c: Context<ApiEnv>): Credential {
  const found = c.get("credential");
  if (!found) {
    throw unauthorized();
  }
  return found;
}

// Runs fn inside the organization's scope as the caller.
// When it wrote events, the Edict-Change-Id response header names the change
// they belong to, which undo takes (ADR 0019).
export function inOrg<T>(
  deps: ApiDeps,
  c: Context<ApiEnv>,
  orgId: string,
  fn: (tx: Transaction, caller: Caller) => Promise<T>,
): Promise<T> {
  const found = credential(c);
  return inScope(deps.db, { ...scopeFor(found), orgId }, async (tx) => {
    const result = await fn(tx, await callerIn(tx, orgId, found));
    if (c.req.method !== "GET") {
      const { rows } = await tx.execute<{ change_id: string | null }>(sql`
        SELECT change_id FROM events
        WHERE change_id = nullif(current_setting('edict.change_id', true), '')::uuid
        LIMIT 1`);
      if (rows[0]?.change_id) {
        c.header(changeHeader, rows[0].change_id);
      }
    }
    return result;
  });
}

export const changeHeader = "Edict-Change-Id";

export function json<T extends z.ZodType>(schema: T, description: string) {
  return { description, content: { "application/json": { schema } } };
}

export function body<T extends z.ZodType>(schema: T) {
  return { body: { required: true, content: { "application/json": { schema } } } };
}

const errorDescriptions: Record<ErrorCode, string> = {
  invalid_request: "The request does not match the schema",
  unauthorized: "Not signed in",
  forbidden: "The caller's role does not allow this",
  not_found: "Not found, or not visible to the caller",
  conflict: "Conflicts with the current state",
  gone: "No longer valid",
  too_large: "Larger than the attachment limit (ATTACHMENT_MAX_BYTES)",
};

const errorStatus = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  gone: 410,
  too_large: 413,
} as const;

export function errors(...codes: ErrorCode[]) {
  return Object.fromEntries(
    codes.map((code) => [errorStatus[code], json(ErrorResponse, errorDescriptions[code])]),
  );
}

export const noContent = { 204: { description: "Done" } };

export const OrgParams = z.object({ orgId: Id });
