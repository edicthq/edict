import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorCode } from "@edicthq/schema";

const statusOf: Record<ErrorCode, ContentfulStatusCode> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  gone: 410,
  too_large: 413,
  rate_limited: 429,
};

// Thrown anywhere in a handler; onApiError turns it into the error response.
// Throwing inside a scope also rolls its transaction back.
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    // Extra fields for the error object, like the current issue on a conflict.
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const unauthorized = () => new ApiError("unauthorized", "Sign in first.");
export const forbidden = (message: string) => new ApiError("forbidden", message);
export const notFound = (what: string) => new ApiError("not_found", `No such ${what}.`);
export const conflict = (message: string, details?: Record<string, unknown>) =>
  new ApiError("conflict", message, details);
export const gone = (message: string) => new ApiError("gone", message);
export const invalid = (message: string) => new ApiError("invalid_request", message);
export const tooLarge = (message: string) => new ApiError("too_large", message);
export const rateLimited = (message: string) => new ApiError("rate_limited", message);

export function errorResponse(c: Context, code: ErrorCode, message: string, details?: Record<string, unknown>) {
  return c.json({ error: { code, message, ...details } }, statusOf[code]);
}

export function onApiError(error: Error, c: Context) {
  if (error instanceof ApiError) {
    return errorResponse(c, error.code, error.message, error.details);
  }
  console.error(error);
  throw error;
}

// Drizzle wraps driver errors and keeps the Postgres error as the cause.
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const cause = (error as { cause?: { code?: string; constraint?: string } }).cause;
  return cause?.code === "23505" && (constraint === undefined || cause.constraint === constraint);
}

// ADR 0018, for resources that compare the whole version.
export function requireVersion(current: number, sent: number, what: string): void {
  if (sent !== current) {
    throw conflict(`The ${what} changed since version ${sent} and is now at version ${current}. Read it again and retry.`);
  }
}

// The fields of input whose value differs from current, as from/to pairs for
// the event log. Fields input leaves out are unchanged. Arrays compare by
// their items, so pass sets already sorted.
export function changesOf<T extends object>(current: T, input: Partial<T>): Partial<Record<keyof T, { from: unknown; to: unknown }>> {
  const changes: Partial<Record<keyof T, { from: unknown; to: unknown }>> = {};
  for (const field of Object.keys(input) as (keyof T)[]) {
    const to = input[field];
    if (to !== undefined && !same(to, current[field])) {
      changes[field] = { from: current[field], to };
    }
  }
  return changes;
}

function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => item === b[i]);
  }
  return a === b;
}
