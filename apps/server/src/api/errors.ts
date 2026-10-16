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
};

// Thrown anywhere in a handler; onApiError turns it into the error response.
// Throwing inside a scope also rolls its transaction back.
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = () => new ApiError("unauthorized", "Sign in first.");
export const forbidden = (message: string) => new ApiError("forbidden", message);
export const notFound = (what: string) => new ApiError("not_found", `No such ${what}.`);
export const conflict = (message: string) => new ApiError("conflict", message);
export const gone = (message: string) => new ApiError("gone", message);
export const invalid = (message: string) => new ApiError("invalid_request", message);

export function errorResponse(c: Context, code: ErrorCode, message: string) {
  return c.json({ error: { code, message } }, statusOf[code]);
}

export function onApiError(error: Error, c: Context) {
  if (error instanceof ApiError) {
    return errorResponse(c, error.code, error.message);
  }
  throw error;
}

// Drizzle wraps driver errors and keeps the Postgres error as the cause.
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const cause = (error as { cause?: { code?: string; constraint?: string } }).cause;
  return cause?.code === "23505" && (constraint === undefined || cause.constraint === constraint);
}
