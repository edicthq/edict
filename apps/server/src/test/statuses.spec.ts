import { describe, expect, it } from "vitest";
import { createTeam, join, orgWithOwner } from "./org.js";
import { startTestServer } from "./server.js";

type Status = { id: string; name: string; category: string; default: boolean; version: number };

describe("statuses", () => {
  it("a new team starts with a default workflow, Todo for new issues", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");

    const res = await owner.get(`${org}/teams/${eng.id}/statuses`);
    expect(res.status).toBe(200);
    expect(res.body.map((s: Status) => [s.name, s.category])).toEqual([
      ["Backlog", "backlog"],
      ["Todo", "todo"],
      ["In Progress", "in_progress"],
      ["In Review", "in_progress"],
      ["Done", "done"],
      ["Canceled", "canceled"],
    ]);
    expect(res.body.filter((s: Status) => s.default).map((s: Status) => s.name)).toEqual(["Todo"]);
  });

  it("admins add statuses, listed within their category", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");

    const created = await owner.post(`${org}/teams/${eng.id}/statuses`, { name: "Triage", category: "backlog" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "Triage", category: "backlog", default: false, version: 1 });

    const names = (await owner.get(`${org}/teams/${eng.id}/statuses`)).body.map((s: Status) => s.name);
    expect(names.slice(0, 3)).toEqual(["Backlog", "Triage", "Todo"]);

    const dup = await owner.post(`${org}/teams/${eng.id}/statuses`, { name: "in review", category: "in_progress" });
    expect(dup.status).toBe(409);
  });

  it("only admins and owners change a team's workflow", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const { client: member } = await join(t.baseUrl, owner, org, "Mia", "member", [eng.id]);

    const res = await member.post(`${org}/teams/${eng.id}/statuses`, { name: "Triage", category: "backlog" });
    expect(res.status).toBe(403);
  });

  it("updates a status at its current version and moves the default", async () => {
    const t = await startTestServer();
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    const statuses: Status[] = (await owner.get(`${org}/teams/${eng.id}/statuses`)).body;
    const backlog = statuses.find((s) => s.name === "Backlog")!;

    const renamed = await owner.patch(`${org}/teams/${eng.id}/statuses/${backlog.id}`, {
      version: backlog.version,
      name: "Icebox",
      default: true,
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: "Icebox", default: true, version: 2 });

    const after: Status[] = (await owner.get(`${org}/teams/${eng.id}/statuses`)).body;
    expect(after.filter((s) => s.default).map((s) => s.name)).toEqual(["Icebox"]);

    const stale = await owner.patch(`${org}/teams/${eng.id}/statuses/${backlog.id}`, {
      version: backlog.version,
      name: "Later",
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("conflict");

    const noVersion = await owner.patch(`${org}/teams/${eng.id}/statuses/${backlog.id}`, { name: "Later" });
    expect(noVersion.status).toBe(400);
  });
});
