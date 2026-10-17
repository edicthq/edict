import { createEdictClient, type ApiError } from "@edicthq/client";

// The web app reaches the API only through @edicthq/client (AGENTS.md). It is
// served by the instance, so the base URL is its own origin.
export const api = createEdictClient();

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiError["code"] | "unknown",
    message: string,
  ) {
    super(message);
  }
}

// openapi-fetch returns { data, error }. Queries and mutations want the data
// or a thrown error with the API's code and message.
export async function unwrap<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await request;
  if (error !== undefined || !response.ok) {
    const body = error as { error?: { code?: ApiError["code"]; message?: string } } | undefined;
    throw new ApiFailure(
      response.status,
      body?.error?.code ?? "unknown",
      body?.error?.message ?? `The server answered ${response.status}.`,
    );
  }
  return data as T;
}
