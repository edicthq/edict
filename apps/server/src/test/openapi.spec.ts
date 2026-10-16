import { describe, expect, it } from "vitest";
import { startTestServer } from "./server.js";

// Agents and the generated client read this document, so its shape is a
// contract (ADR 0010).
describe("OpenAPI document", () => {
  it("describes every /api/v1 operation with named schemas", async () => {
    const t = await startTestServer();
    const res = await fetch(`${t.baseUrl}/api/v1/openapi.json`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };

    expect(doc.openapi).toBe("3.1.0");
    const operations = Object.entries(doc.paths)
      .flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`))
      .sort();
    expect(operations).toEqual([
      "DELETE /organizations/{orgId}/invites/{inviteId}",
      "DELETE /organizations/{orgId}/members/{memberId}",
      "DELETE /organizations/{orgId}/teams/{teamId}/members/{memberId}",
      "GET /invites/{token}",
      "GET /organizations",
      "GET /organizations/{orgId}/events",
      "GET /organizations/{orgId}/invites",
      "GET /organizations/{orgId}/members",
      "GET /organizations/{orgId}/teams",
      "GET /organizations/{orgId}/teams/{teamId}/members",
      "PATCH /organizations/{orgId}/members/{memberId}",
      "POST /invites/{token}/accept",
      "POST /organizations",
      "POST /organizations/{orgId}/invites",
      "POST /organizations/{orgId}/teams",
      "POST /organizations/{orgId}/teams/{teamId}/members",
    ]);
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining(["Error", "Organization", "Member", "Membership", "Team", "Invite", "Event"]),
    );
  });
});
