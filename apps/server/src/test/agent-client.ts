import { expect } from "vitest";
import type { ApiClient } from "./server.js";

// A caller of /api/v1 with a bearer credential: an API key or OAuth token.
export function bearerClient(baseUrl: string, token: string) {
  const call = async (method: string, path: string, body?: unknown) => {
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${baseUrl}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined, headers: res.headers };
  };
  return {
    get: (path: string) => call("GET", path),
    post: (path: string, body?: unknown) => call("POST", path, body ?? {}),
    patch: (path: string, body: unknown) => call("PATCH", path, body),
    delete: (path: string) => call("DELETE", path),
  };
}

// An admin-created agent with an API key, in the given teams.
export async function runner(baseUrl: string, admin: ApiClient, org: string, teamIds: string[], name = "Ferro") {
  const agent = await admin.post(`${org}/agents`, { name, teamIds });
  expect(agent.status).toBe(201);
  const key = await admin.post(`${org}/agents/${agent.body.id}/api-keys`, { name: "runner" });
  const secret = key.body.secret as string;
  return { id: agent.body.id as string, secret, client: bearerClient(baseUrl, secret) };
}
