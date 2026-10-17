import { OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { inScope, type Database, type Transaction } from "@edicthq/db";
import { ErrorResponse, Id, type ErrorCode } from "@edicthq/schema";
import type { Mailer } from "../email.js";
import { callerMember, type MemberRow } from "./access.js";
import { errorResponse, onApiError, unauthorized } from "./errors.js";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  instanceAdmin: boolean;
}

export interface ApiDeps {
  db: Database;
  getUser: (headers: Headers) => Promise<SessionUser | null>;
  // Unset when the instance has no email set up.
  mailer?: Mailer;
  // Where links in responses point. Defaults to the request's origin.
  publicUrl?: string;
}

export type ApiEnv = { Variables: { user: SessionUser | null } };

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

export function signedIn(c: Context<ApiEnv>): SessionUser {
  const user = c.get("user");
  if (!user) {
    throw unauthorized();
  }
  return user;
}

// Runs fn inside the organization's scope as the signed-in user's member.
export function inOrg<T>(
  deps: ApiDeps,
  c: Context<ApiEnv>,
  orgId: string,
  fn: (tx: Transaction, caller: MemberRow) => Promise<T>,
): Promise<T> {
  const user = signedIn(c);
  return inScope(deps.db, { orgId, userId: user.id }, async (tx) =>
    fn(tx, await callerMember(tx, orgId, user.id)),
  );
}

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
};

const errorStatus = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  gone: 410,
} as const;

export function errors(...codes: ErrorCode[]) {
  return Object.fromEntries(
    codes.map((code) => [errorStatus[code], json(ErrorResponse, errorDescriptions[code])]),
  );
}

export const noContent = { 204: { description: "Done" } };

export const OrgParams = z.object({ orgId: Id });
