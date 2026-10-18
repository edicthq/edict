import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it } from "vitest";
import { connect } from "./oauth-client.js";
import { createTeam, orgWithOwner } from "./org.js";
import { startTestServer, type ApiClient, type ApiResponse } from "./server.js";

type Status = { id: string; name: string; category: string };
type Project = {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  leadId: string | null;
  startDate: string | null;
  targetDate: string | null;
  progress: {
    total: number;
    completed: number;
    percentage: number;
    byCategory: Record<string, number>;
    estimate: { total: number; completed: number };
  };
  version: number;
};

async function statusWithCategory(client: ApiClient, org: string, teamId: string, category: string): Promise<Status> {
  const statuses: Status[] = (await client.get(`${org}/teams/${teamId}/statuses`)).body;
  return statuses.find((s) => s.category === category)!;
}

const changeOf = (res: ApiResponse) => {
  const id = res.headers.get("edict-change-id");
  expect(id).toBeTruthy();
  return id!;
};

describe("projects", () => {
  it("creates, reads, updates, and trashes projects", async () => {
    const t = await startTestServer();
    const { owner, org, ownerId } = await orgWithOwner(t.baseUrl);

    // Create project with auto-generated slug
    const createRes = await owner.post(`${org}/projects`, {
      name: "Mobile App Redesign",
      description: "Complete redesign of mobile app",
      status: "in_progress",
      leadId: ownerId,
      targetDate: "2026-12-31T00:00:00.000Z",
    });
    expect(createRes.status).toBe(201);
    const project: Project = createRes.body;
    expect(project.name).toBe("Mobile App Redesign");
    expect(project.slug).toBe("mobile-app-redesign");
    expect(project.status).toBe("in_progress");
    expect(project.leadId).toBe(ownerId);
    expect(project.version).toBe(1);
    expect(project.progress.total).toBe(0);

    // Read by slug
    const getSlug = await owner.get(`${org}/projects/mobile-app-redesign`);
    expect(getSlug.status).toBe(200);
    expect(getSlug.body.id).toBe(project.id);

    // Read by ID
    const getId = await owner.get(`${org}/projects/${project.id}`);
    expect(getId.status).toBe(200);
    expect(getId.body.slug).toBe("mobile-app-redesign");

    // List projects
    const listRes = await owner.get(`${org}/projects`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].id).toBe(project.id);

    // Update project with matching version
    const updateRes = await owner.patch(`${org}/projects/${project.id}`, {
      version: 1,
      status: "paused",
      description: "Temporarily on hold",
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.version).toBe(2);
    expect(updateRes.body.status).toBe("paused");
    expect(updateRes.body.description).toBe("Temporarily on hold");

    // Stale version triggers 409 conflict
    const staleUpdate = await owner.patch(`${org}/projects/${project.id}`, {
      version: 1,
      status: "in_progress",
    });
    expect(staleUpdate.status).toBe(409);
    expect(staleUpdate.body.error.code).toBe("conflict");
    expect(staleUpdate.body.error.current.version).toBe(2);

    // Move to trash
    const delRes = await owner.delete(`${org}/projects/${project.id}`);
    expect(delRes.status).toBe(204);

    // Trashed project returns 410 gone
    const goneRes = await owner.get(`${org}/projects/${project.id}`);
    expect(goneRes.status).toBe(410);

    // List excludes trashed projects
    const emptyList = await owner.get(`${org}/projects`);
    expect(emptyList.status).toBe(200);
    expect(emptyList.body).toHaveLength(0);

    // Trashed projects endpoint lists it
    const trashedRes = await owner.get(`${org}/trash/projects`);
    expect(trashedRes.status).toBe(200);
    expect(trashedRes.body).toHaveLength(1);
    expect(trashedRes.body[0].id).toBe(project.id);

    // Restore from trash
    const restoreRes = await owner.post(`${org}/projects/${project.id}/restore`);
    expect(restoreRes.status).toBe(200);

    // Readable again
    const restored = await owner.get(`${org}/projects/${project.id}`);
    expect(restored.status).toBe(200);
    expect(restored.body.status).toBe("paused");
  });

  it("handles custom slugs and slug conflicts", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);

    const first = await owner.post(`${org}/projects`, {
      name: "Q3 Goals",
      slug: "q3-goals",
    });
    expect(first.status).toBe(201);
    expect(first.body.slug).toBe("q3-goals");

    // Explicit duplicate slug fails with 409 conflict
    const dup = await owner.post(`${org}/projects`, {
      name: "Another Q3",
      slug: "q3-goals",
    });
    expect(dup.status).toBe(409);

    // Omitted slug with name clash auto-suffixes
    const autoSuffix = await owner.post(`${org}/projects`, {
      name: "Q3 Goals",
    });
    expect(autoSuffix.status).toBe(201);
    expect(autoSuffix.body.slug).toBe("q3-goals-1");
  });

  it("tracks cross-team issues, computes progress, and supports search", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const des = await createTeam(owner, org, "DES");

    const engTodo = await statusWithCategory(owner, org, eng.id, "todo");
    const engDone = await statusWithCategory(owner, org, eng.id, "done");
    const desDone = await statusWithCategory(owner, org, des.id, "done");
    const desCanceled = await statusWithCategory(owner, org, des.id, "canceled");

    // Create project
    const projRes = await owner.post(`${org}/projects`, {
      name: "Unified Checkout",
      slug: "checkout",
    });
    const projectId = projRes.body.id as string;

    // Create issues across ENG and DES in this project
    const i1 = await owner.post(`${org}/teams/${eng.id}/issues`, {
      title: "Backend API for checkout",
      projectId,
      statusId: engDone.id,
      estimate: 5,
    });
    expect(i1.status).toBe(201);
    expect(i1.body.projectId).toBe(projectId);

    const i2 = await owner.post(`${org}/teams/${eng.id}/issues`, {
      title: "Database migrations for checkout",
      projectId,
      statusId: engTodo.id,
      estimate: 3,
    });
    expect(i2.status).toBe(201);

    const i3 = await owner.post(`${org}/teams/${des.id}/issues`, {
      title: "Design checkout flow",
      projectId,
      statusId: desDone.id,
      estimate: 2,
    });
    expect(i3.status).toBe(201);

    const i4 = await owner.post(`${org}/teams/${des.id}/issues`, {
      title: "Old checkout mockups",
      projectId,
      statusId: desCanceled.id,
      estimate: 1,
    });
    expect(i4.status).toBe(201);

    // Progress metrics:
    // Total = 4
    // Active (total - canceled) = 3
    // Done = 2 (i1: 5 est, i3: 2 est => 7 completed est)
    // Percentage = (2 / 3) * 100 = 67%
    // Total estimate = 5 + 3 + 2 + 1 = 11
    const p = await owner.get(`${org}/projects/checkout`);
    expect(p.status).toBe(200);
    expect(p.body.progress).toEqual({
      total: 4,
      completed: 2,
      percentage: 67,
      byCategory: {
        backlog: 0,
        todo: 1,
        in_progress: 0,
        done: 2,
        canceled: 1,
      },
      estimate: {
        total: 11,
        completed: 7,
      },
    });

    // List project issues across teams
    const issuesRes = await owner.get(`${org}/projects/checkout/issues`);
    expect(issuesRes.status).toBe(200);
    expect(issuesRes.body).toHaveLength(4);
    const identifiers = issuesRes.body.map((i: { identifier: string }) => i.identifier);
    expect(identifiers).toContain("ENG-1");
    expect(identifiers).toContain("ENG-2");
    expect(identifiers).toContain("DES-1");
    expect(identifiers).toContain("DES-2");

    // Search issues by projectId filter
    const searchRes = await owner.get(`${org}/issues?projectId=${projectId}&include=all`);
    expect(searchRes.status).toBe(200);
    expect(searchRes.body).toHaveLength(4);

    // Updating an issue to remove from project or change project
    const updateIssueRes = await owner.patch(`${org}/issues/ENG-2`, {
      version: 1,
      projectId: null,
    });
    expect(updateIssueRes.status).toBe(200);
    expect(updateIssueRes.body.projectId).toBeNull();

    // Recheck progress: total becomes 3, active 2, completed 2 => 100%
    const pUpdated = await owner.get(`${org}/projects/checkout`);
    expect(pUpdated.body.progress.total).toBe(3);
    expect(pUpdated.body.progress.completed).toBe(2);
    expect(pUpdated.body.progress.percentage).toBe(100);
  });

  it("supports undo and redo on project creation and deletion", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);

    // Create project
    const created = await owner.post(`${org}/projects`, { name: "Undo Test Project" });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;
    const createChangeId = changeOf(created);

    // Undoing creation moves project to trash
    const undoCreate = await owner.post(`${org}/changes/${createChangeId}/undo`);
    expect(undoCreate.status).toBe(200);
    const goneCheck = await owner.get(`${org}/projects/${projectId}`);
    expect(goneCheck.status).toBe(410);

    // Redoing creation restores it
    const redoCreate = await owner.post(`${org}/changes/${undoCreate.body.changeId}/undo`);
    expect(redoCreate.status).toBe(200);
    const liveCheck = await owner.get(`${org}/projects/${projectId}`);
    expect(liveCheck.status).toBe(200);

    // Delete project
    const del = await owner.delete(`${org}/projects/${projectId}`);
    expect(del.status).toBe(204);
    const delChangeId = changeOf(del);

    // Undoing delete brings it back
    const undoDel = await owner.post(`${org}/changes/${delChangeId}/undo`);
    expect(undoDel.status).toBe(200);
    const backCheck = await owner.get(`${org}/projects/${projectId}`);
    expect(backCheck.status).toBe(200);
  });

  it("supports get_project tool and edict://project/{slug} resource in MCP", async () => {
    const t = await startTestServer();
    const { owner, org, orgId, ownerId } = await orgWithOwner(t.baseUrl, "Lead");
    const eng = await createTeam(owner, org, "ENG");

    const projRes = await owner.post(`${org}/projects`, {
      name: "Auth System",
      slug: "auth-system",
      description: "Modernize authentication flow",
      leadId: ownerId,
    });
    expect(projRes.status).toBe(201);

    await owner.post(`${org}/teams/${eng.id}/issues`, {
      title: "Support WebAuthn",
      projectId: projRes.body.id,
    });

    const { accessToken } = await connect(t.baseUrl, owner, orgId);
    const mcp = new Client({ name: "test-client", version: "1.0.0" });
    await mcp.connect(
      new StreamableHTTPClientTransport(new URL(`${t.baseUrl}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
      }),
    );

    // Test get_project tool
    const toolRes = (await mcp.callTool({
      name: "get_project",
      arguments: { project: "auth-system" },
    })) as { content: { type: string; text: string }[] };
    expect(toolRes.content[0]?.text).toContain("# Auth System (auth-system)");
    expect(toolRes.content[0]?.text).toContain("Modernize authentication flow");
    expect(toolRes.content[0]?.text).toContain("Support WebAuthn");

    // Test edict://project/{slug} resource
    const resourceRes = await mcp.readResource({ uri: "edict://project/auth-system" });
    const contentText = (resourceRes.contents[0] as { text: string })?.text;
    expect(contentText).toContain("# Auth System (auth-system)");
    expect(contentText).toContain("Modernize authentication flow");
  });
});
