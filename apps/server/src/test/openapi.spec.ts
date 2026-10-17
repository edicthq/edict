import { readFileSync } from "node:fs";
import { join } from "node:path";
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
      "DELETE /organizations/{orgId}/issues/{issueRef}/relations/{relationId}",
      "DELETE /organizations/{orgId}/labels/{labelId}",
      "DELETE /organizations/{orgId}/members/{memberId}",
      "DELETE /organizations/{orgId}/teams/{teamId}/members/{memberId}",
      "GET /instance",
      "GET /invites/{token}",
      "GET /organizations",
      "GET /organizations/{orgId}/events",
      "GET /organizations/{orgId}/invites",
      "GET /organizations/{orgId}/issues/{issueRef}",
      "GET /organizations/{orgId}/issues/{issueRef}/relations",
      "GET /organizations/{orgId}/issues/{issueRef}/sub-issues",
      "GET /organizations/{orgId}/labels",
      "GET /organizations/{orgId}/members",
      "GET /organizations/{orgId}/teams",
      "GET /organizations/{orgId}/teams/{teamId}",
      "GET /organizations/{orgId}/teams/{teamId}/issues",
      "GET /organizations/{orgId}/teams/{teamId}/labels",
      "GET /organizations/{orgId}/teams/{teamId}/members",
      "GET /organizations/{orgId}/teams/{teamId}/statuses",
      "PATCH /instance",
      "PATCH /organizations/{orgId}/issues/{issueRef}",
      "PATCH /organizations/{orgId}/labels/{labelId}",
      "PATCH /organizations/{orgId}/members/{memberId}",
      "PATCH /organizations/{orgId}/teams/{teamId}",
      "PATCH /organizations/{orgId}/teams/{teamId}/statuses/{statusId}",
      "POST /invites/{token}/accept",
      "POST /organizations",
      "POST /organizations/{orgId}/invites",
      "POST /organizations/{orgId}/issues/{issueRef}/relations",
      "POST /organizations/{orgId}/labels",
      "POST /organizations/{orgId}/teams",
      "POST /organizations/{orgId}/teams/{teamId}/issues",
      "POST /organizations/{orgId}/teams/{teamId}/labels",
      "POST /organizations/{orgId}/teams/{teamId}/members",
      "POST /organizations/{orgId}/teams/{teamId}/statuses",
    ]);
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining([
        "Error",
        "Organization",
        "Member",
        "Membership",
        "Team",
        "Invite",
        "Event",
        "InstanceSettings",
        "Status",
        "Issue",
        "IssueConflict",
        "Label",
        "LinkedIssue",
        "Relation",
      ]),
    );
  });

  it("matches the document packages/client was generated from", async () => {
    const t = await startTestServer();
    const served = await (await fetch(`${t.baseUrl}/api/v1/openapi.json`)).json();
    const committed = JSON.parse(
      readFileSync(join(import.meta.dirname, "../../../../packages/client/openapi.json"), "utf8"),
    );
    // On failure, run `pnpm api:generate` and commit the result.
    expect(served).toEqual(committed);
  });
});
