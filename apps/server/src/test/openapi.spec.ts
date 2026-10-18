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
      "DELETE /organizations/{orgId}/agents/{agentId}/api-keys/{keyId}",
      "DELETE /organizations/{orgId}/comments/{commentId}",
      "DELETE /organizations/{orgId}/invites/{inviteId}",
      "DELETE /organizations/{orgId}/issues/{issueRef}",
      "DELETE /organizations/{orgId}/issues/{issueRef}/links/{linkId}",
      "DELETE /organizations/{orgId}/issues/{issueRef}/relations/{relationId}",
      "DELETE /organizations/{orgId}/labels/{labelId}",
      "DELETE /organizations/{orgId}/members/{memberId}",
      "DELETE /organizations/{orgId}/projects/{projectRef}",
      "DELETE /organizations/{orgId}/teams/{teamId}/members/{memberId}",
      "DELETE /organizations/{orgId}/teams/{teamId}/saved-views/{savedViewId}",
      "DELETE /organizations/{orgId}/teams/{teamId}/templates/{templateId}",
      "DELETE /organizations/{orgId}/webhooks/{webhookId}",
      "GET /instance",
      "GET /invites/{token}",
      "GET /organizations",
      "GET /organizations/{orgId}/agents",
      "GET /organizations/{orgId}/agents/{agentId}",
      "GET /organizations/{orgId}/agents/{agentId}/api-keys",
      "GET /organizations/{orgId}/events",
      "GET /organizations/{orgId}/export",
      "GET /organizations/{orgId}/inbox",
      "GET /organizations/{orgId}/inbox/unread-count",
      "GET /organizations/{orgId}/invites",
      "GET /organizations/{orgId}/issues",
      "GET /organizations/{orgId}/issues/{issueRef}",
      "GET /organizations/{orgId}/issues/{issueRef}/attachments",
      "GET /organizations/{orgId}/issues/{issueRef}/comments",
      "GET /organizations/{orgId}/issues/{issueRef}/links",
      "GET /organizations/{orgId}/issues/{issueRef}/progress",
      "GET /organizations/{orgId}/issues/{issueRef}/relations",
      "GET /organizations/{orgId}/issues/{issueRef}/sub-issues",
      "GET /organizations/{orgId}/labels",
      "GET /organizations/{orgId}/members",
      "GET /organizations/{orgId}/my-work",
      "GET /organizations/{orgId}/projects",
      "GET /organizations/{orgId}/projects/{projectRef}",
      "GET /organizations/{orgId}/projects/{projectRef}/issues",
      "GET /organizations/{orgId}/teams",
      "GET /organizations/{orgId}/teams/{teamId}",
      "GET /organizations/{orgId}/teams/{teamId}/issues",
      "GET /organizations/{orgId}/teams/{teamId}/labels",
      "GET /organizations/{orgId}/teams/{teamId}/members",
      "GET /organizations/{orgId}/teams/{teamId}/saved-views",
      "GET /organizations/{orgId}/teams/{teamId}/saved-views/{savedViewId}",
      "GET /organizations/{orgId}/teams/{teamId}/statuses",
      "GET /organizations/{orgId}/teams/{teamId}/templates",
      "GET /organizations/{orgId}/teams/{teamId}/templates/{templateId}",
      "GET /organizations/{orgId}/trash",
      "GET /organizations/{orgId}/trash/projects",
      "GET /organizations/{orgId}/webhooks",
      "GET /organizations/{orgId}/webhooks/{webhookId}",
      "GET /organizations/{orgId}/webhooks/{webhookId}/deliveries",
      "PATCH /instance",
      "PATCH /organizations/{orgId}/agents/{agentId}",
      "PATCH /organizations/{orgId}/comments/{commentId}",
      "PATCH /organizations/{orgId}/inbox/{itemId}",
      "PATCH /organizations/{orgId}/issues/{issueRef}",
      "PATCH /organizations/{orgId}/labels/{labelId}",
      "PATCH /organizations/{orgId}/members/{memberId}",
      "PATCH /organizations/{orgId}/projects/{projectRef}",
      "PATCH /organizations/{orgId}/teams/{teamId}",
      "PATCH /organizations/{orgId}/teams/{teamId}/saved-views/{savedViewId}",
      "PATCH /organizations/{orgId}/teams/{teamId}/statuses/{statusId}",
      "PATCH /organizations/{orgId}/teams/{teamId}/templates/{templateId}",
      "PATCH /organizations/{orgId}/webhooks/{webhookId}",
      "POST /invites/{token}/accept",
      "POST /oauth/organization",
      "POST /organizations",
      "POST /organizations/{orgId}/agents",
      "POST /organizations/{orgId}/agents/{agentId}/api-keys",
      "POST /organizations/{orgId}/agents/{agentId}/pause",
      "POST /organizations/{orgId}/agents/{agentId}/resume",
      "POST /organizations/{orgId}/changes/{changeId}/undo",
      "POST /organizations/{orgId}/comments/{commentId}/restore",
      "POST /organizations/{orgId}/inbox/read-all",
      "POST /organizations/{orgId}/invites",
      "POST /organizations/{orgId}/issues/bulk-delete",
      "POST /organizations/{orgId}/issues/bulk-update",
      "POST /organizations/{orgId}/issues/{issueRef}/attachments",
      "POST /organizations/{orgId}/issues/{issueRef}/comments",
      "POST /organizations/{orgId}/issues/{issueRef}/links",
      "POST /organizations/{orgId}/issues/{issueRef}/progress",
      "POST /organizations/{orgId}/issues/{issueRef}/relations",
      "POST /organizations/{orgId}/issues/{issueRef}/restore",
      "POST /organizations/{orgId}/labels",
      "POST /organizations/{orgId}/projects",
      "POST /organizations/{orgId}/projects/{projectRef}/restore",
      "POST /organizations/{orgId}/teams",
      "POST /organizations/{orgId}/teams/{teamId}/issues",
      "POST /organizations/{orgId}/teams/{teamId}/labels",
      "POST /organizations/{orgId}/teams/{teamId}/members",
      "POST /organizations/{orgId}/teams/{teamId}/saved-views",
      "POST /organizations/{orgId}/teams/{teamId}/statuses",
      "POST /organizations/{orgId}/teams/{teamId}/templates",
      "POST /organizations/{orgId}/webhooks",
      "POST /organizations/{orgId}/webhooks/{webhookId}/deliveries/{deliveryId}/redeliver",
      "POST /organizations/{orgId}/webhooks/{webhookId}/rotate-secret",
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
        "Project",
        "ProjectConflict",
        "ProjectProgress",
        "Template",
        "TrashedProject",
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
