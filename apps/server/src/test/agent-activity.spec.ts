// ADR 0029: an agent's work shows on the issue without the agent spending
// tokens on it. Edict writes progress from what the delegate does, and Claude
// Code's HTTP hooks post the rest with a hook key.
import { describe, expect, it } from "vitest";
import { bearerClient, runner } from "./agent-client.js";
import { connect } from "./oauth-client.js";
import { createTeam, join, orgWithOwner } from "./org.js";
import { startTestServer } from "./server.js";

type Progress = { state: string; message: string; source: string; agentId: string; links: { url: string; title?: string }[] };

async function setup() {
  const t = await startTestServer();
  const { owner, org, orgId, ownerId } = await orgWithOwner(t.baseUrl, "Amirali");
  const eng = await createTeam(owner, org, "ENG");
  const ferro = await runner(t.baseUrl, owner, org, [eng.id]);
  const issue = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Fix the login bug", assigneeId: ownerId, delegateId: ferro.id }))
    .body as { id: string; identifier: string; version: number };
  const statuses = (await owner.get(`${org}/teams/${eng.id}/statuses`)).body as { id: string; name: string; category: string }[];
  const status = (category: string) => statuses.find((s) => s.category === category)!;
  const progress = async (ref = issue.identifier) => (await owner.get(`${org}/issues/${ref}/progress`)).body as Progress[];
  return { t, owner, org, orgId, ownerId, eng, ferro, issue, status, progress };
}

describe("activity progress", () => {
  it("is written when the delegate moves the issue, links a URL or comments", async () => {
    const { org, ferro, issue, status, progress } = await setup();
    const started = await ferro.client.patch(`${org}/issues/${issue.identifier}`, { version: issue.version, statusId: status("in_progress").id });
    expect(started.status).toBe(200);
    expect((await progress())[0]).toMatchObject({ source: "activity", state: "working", message: "Moved to In Progress", agentId: ferro.id });

    await ferro.client.post(`${org}/issues/${issue.identifier}/links`, { url: "https://github.com/edicthq/edict/pull/9", title: "Fix login" });
    expect((await progress())[0]).toMatchObject({
      source: "activity",
      state: "working",
      message: "Linked Fix login",
      links: [{ url: "https://github.com/edicthq/edict/pull/9", title: "Fix login" }],
    });

    await ferro.client.post(`${org}/issues/${issue.identifier}/comments`, { body: "Root cause: the `next` param was dropped.\n\nMore below." });
    expect((await progress())[0]).toMatchObject({ source: "activity", state: "working", message: "Root cause: the `next` param was dropped." });

    await ferro.client.patch(`${org}/issues/${issue.identifier}`, { version: started.body.version, statusId: status("done").id });
    expect((await progress())[0]).toMatchObject({ source: "activity", state: "done", message: "Moved to Done" });
  });

  it("keeps a blocked or needs-input state when the delegate links or comments", async () => {
    const { org, ferro, issue, progress } = await setup();
    await ferro.client.post(`${org}/issues/${issue.identifier}/progress`, { state: "needs_input", message: "Which provider?" });
    await ferro.client.post(`${org}/issues/${issue.identifier}/comments`, { body: "Google or GitHub first?" });
    expect((await progress())[0]).toMatchObject({ source: "activity", state: "needs_input", message: "Google or GitHub first?" });
  });

  it("stays done when the delegate comments on an issue it closed", async () => {
    const { org, ferro, issue, status, progress } = await setup();
    await ferro.client.patch(`${org}/issues/${issue.identifier}`, { version: issue.version, statusId: status("done").id });
    await ferro.client.post(`${org}/issues/${issue.identifier}/comments`, { body: "Shipped in 1f52e24." });
    expect((await progress())[0]).toMatchObject({ source: "activity", state: "done", message: "Shipped in 1f52e24." });
  });

  it("is not written for people or agents who are not the delegate", async () => {
    const { t, owner, org, eng, issue, status, progress } = await setup();
    const other = await runner(t.baseUrl, owner, org, [eng.id], "Other");
    const moved = await owner.patch(`${org}/issues/${issue.identifier}`, { version: issue.version, statusId: status("in_progress").id });
    await other.client.post(`${org}/issues/${issue.identifier}/comments`, { body: "Drive-by" });
    await owner.post(`${org}/issues/${issue.identifier}/links`, { url: "https://example.com/spec" });
    expect(moved.status).toBe(200);
    expect(await progress()).toEqual([]);
  });

  it("writes for an agent that delegates the issue to itself in the same change", async () => {
    const { t, owner, org, eng, status, progress } = await setup();
    const other = await runner(t.baseUrl, owner, org, [eng.id], "Other");
    const loose = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Nobody's yet" })).body;
    const taken = await other.client.patch(`${org}/issues/${loose.identifier}`, {
      version: loose.version,
      delegateId: other.id,
      statusId: status("in_progress").id,
    });
    expect(taken.status).toBe(200);
    expect(await progress(loose.identifier)).toMatchObject([{ source: "activity", agentId: other.id, message: "Moved to In Progress" }]);
  });

  it("makes no inbox items, and its change undoes without writing more", async () => {
    const { owner, org, ferro, issue, status, progress } = await setup();
    const before = ((await owner.get(`${org}/inbox`)).body as { type: string }[]).length;
    const moved = await ferro.client.patch(`${org}/issues/${issue.identifier}`, { version: issue.version, statusId: status("in_progress").id });
    const items = (await owner.get(`${org}/inbox`)).body as { type: string }[];
    expect(items.length - before).toBe(1);
    expect(items.map((item) => item.type)).not.toContain("progress_posted");

    const undone = await ferro.client.post(`${org}/changes/${moved.headers.get("edict-change-id")}/undo`);
    expect(undone.status).toBe(200);
    expect(await progress()).toHaveLength(1);
  });

  it("marks what the agent posts itself as agent", async () => {
    const { org, ferro, issue, progress } = await setup();
    await ferro.client.post(`${org}/issues/${issue.identifier}/progress`, { state: "blocked", message: "No staging access." });
    expect((await progress())[0]).toMatchObject({ source: "agent", state: "blocked" });
  });
});

describe("hook keys", () => {
  it("can call only the agent hooks endpoint", async () => {
    const { t, owner, org, ferro } = await setup();
    const created = await owner.post(`${org}/agents/${ferro.id}/api-keys`, { name: "hooks", scope: "hooks" });
    expect(created.status).toBe(201);
    expect(created.body.apiKey.scope).toBe("hooks");
    expect(created.body.secret).toMatch(/^edict_ak_/);
    const hook = bearerClient(t.baseUrl, created.body.secret);
    const res = await hook.get(`${org}/my-work`);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/hook key/i);
    expect((await hook.get("/organizations")).status).toBe(403);
    const mcp = await fetch(`${t.baseUrl}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${created.body.secret}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(mcp.status).toBe(403);
    const keys = (await owner.get(`${org}/agents/${ferro.id}/api-keys`)).body as { scope: string }[];
    expect(keys.map((key) => key.scope).sort()).toEqual(["full", "hooks"]);
  });

  it("can be created by the person who connected an agent, and nobody else below admin", async () => {
    const { t, owner, org, orgId, eng } = await setup();
    const sam = await join(t.baseUrl, owner, org, "Sam", "member", [eng.id]);
    const kim = await join(t.baseUrl, owner, org, "Kim", "member", [eng.id]);
    const claude = bearerClient(t.baseUrl, (await connect(t.baseUrl, sam.client, orgId)).accessToken);
    const agentId = (await claude.get("/organizations")).body[0].member.id as string;

    const path = `${org}/agents/${agentId}/api-keys`;
    const mine = await sam.client.post(path, { name: "laptop", scope: "hooks" });
    expect(mine.status).toBe(201);
    expect((await sam.client.get(path)).body).toHaveLength(1);
    expect((await kim.client.post(path, { name: "nope", scope: "hooks" })).status).toBe(403);
    // A connected agent acts through OAuth: no full keys, even from an admin.
    expect((await owner.post(path, { name: "full" })).status).toBe(400);
    expect((await sam.client.post(path, { name: "full", scope: "full" })).status).toBe(403);
    expect((await sam.client.delete(`${path}/${mine.body.apiKey.id}`)).status).toBe(204);
  });
});

describe("Claude Code hooks", () => {
  async function hooked() {
    const s = await setup();
    const key = (await s.owner.post(`${s.org}/agents/${s.ferro.id}/api-keys`, { name: "hooks", scope: "hooks" })).body.secret as string;
    const send = async (input: Record<string, unknown>, token = key) => {
      const res = await fetch(`${s.t.baseUrl}/api/v1${s.org}/agent-hooks/claude-code`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ session_id: "s1", transcript_path: "/tmp/t.jsonl", cwd: "/repo", ...input }),
      });
      return { status: res.status, text: await res.text() };
    };
    const tool = (name: string, toolInput: Record<string, unknown>, response: unknown = { stdout: "", stderr: "" }) =>
      send({ hook_event_name: "PostToolUse", tool_name: name, tool_input: toolInput, tool_response: response, tool_use_id: "toolu_1" });
    return { ...s, key, send, tool };
  }

  it("answers 204 with no body, and writes nothing for a session with no issue", async () => {
    const { send, progress } = await hooked();
    const res = await send({ hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: "All done." });
    expect(res).toEqual({ status: 204, text: "" });
    expect((await send({ hook_event_name: "SomethingNew" })).status).toBe(204);
    expect(await progress()).toEqual([]);
  });

  it("ties the session to the issue an Edict tool names, and says it picked it up once", async () => {
    const { tool, issue, progress } = await hooked();
    expect((await tool("mcp__edict__get_issue", { issue: issue.identifier })).status).toBe(204);
    await tool("mcp__edict__update_issue", { issue: issue.identifier, version: 1 });
    expect(await progress()).toMatchObject([{ source: "hook", state: "working", message: "Picked up" }]);
  });

  it("does not tie the session to an issue delegated to someone else", async () => {
    const { owner, org, eng, tool, send, progress } = await hooked();
    const loose = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Somebody else's" })).body;
    await tool("mcp__edict__get_issue", { issue: loose.identifier });
    await send({ hook_event_name: "Stop", last_assistant_message: "Read it." });
    expect(await progress(loose.identifier)).toEqual([]);
  });

  it("reports commits, links pull requests, and says done when the turn ends", async () => {
    const { owner, org, tool, send, issue, progress } = await hooked();
    await tool("mcp__edict__get_issue", { issue: issue.identifier });
    await tool(
      "Bash",
      { command: 'git commit -m "Keep the next param through OAuth"' },
      { stdout: "[fix-login 1a2b3c4] Keep the next param through OAuth\n 1 file changed, 2 insertions(+)", stderr: "" },
    );
    // A commit that failed writes nothing.
    await tool("Bash", { command: "git commit -m nothing" }, { stdout: "nothing to commit, working tree clean", stderr: "" });
    await tool(
      "Bash",
      { command: "gh pr create --fill" },
      { stdout: "https://github.com/edicthq/edict/pull/42\n", stderr: "" },
    );
    // Other commands are none of Edict's business.
    await tool("Bash", { command: "ls" }, { stdout: "a b c", stderr: "" });
    const long = `Fixed the redirect. ${"x".repeat(700)}`;
    await send({ hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: long });

    const updates = (await progress()).reverse();
    expect(updates.map((u) => [u.source, u.state])).toEqual([
      ["hook", "working"],
      ["hook", "working"],
      ["hook", "working"],
      ["hook", "done"],
    ]);
    expect(updates[1]!.message).toBe("Committed `1a2b3c4` Keep the next param through OAuth");
    expect(updates[2]!.links).toEqual([{ url: "https://github.com/edicthq/edict/pull/42", title: "Pull request #42" }]);
    expect(updates[3]!.message.length).toBeLessThanOrEqual(601);
    expect(updates[3]!.message.startsWith("Fixed the redirect.")).toBe(true);
    const links = (await owner.get(`${org}/issues/${issue.identifier}/links`)).body as { url: string }[];
    expect(links.map((l) => l.url)).toEqual(["https://github.com/edicthq/edict/pull/42"]);
    // Only done reaches the assignee's inbox.
    const inbox = (await owner.get(`${org}/inbox`)).body as { type: string; progressState: string | null }[];
    expect(inbox.filter((item) => item.type === "progress_posted").map((item) => item.progressState)).toEqual(["done"]);
  });

  it("reports a quiet commit by the subject it was given", async () => {
    const { tool, issue, progress } = await hooked();
    await tool("mcp__edict__get_issue", { issue: issue.identifier });
    await tool("Bash", { command: 'git add . && git commit -q -m "Keep the next param"' }, { stdout: "", stderr: "" });
    await tool("Bash", { command: "git commit -q -F /tmp/msg" }, { stdout: "", stderr: "" });
    // Mentioning git commit in a script is not committing.
    await tool("Bash", { command: "python3 - <<'EOF'\nprint('git commit -m \"x\"')\nEOF" }, { stdout: "git commit -m \"x\"", stderr: "" });
    expect((await progress()).slice(0, 2).map((u) => u.message)).toEqual(["Committed", "Committed Keep the next param"]);
  });

  it("takes the commit Claude Code saw, wherever git printed its summary", async () => {
    const { tool, issue, progress } = await hooked();
    await tool("mcp__edict__get_issue", { issue: issue.identifier });
    await tool(
      "Bash",
      { command: 'curl -s localhost/health && git commit -m "Ship it"' },
      { stdout: '{"ok":true}[main 9f8e7d6] Ship it', stderr: "", gitOperation: { commit: { sha: "9f8e7d6", kind: "committed", branch: "main" } } },
    );
    expect((await progress())[0]!.message).toBe("Committed `9f8e7d6` Ship it");
  });

  it("leaves a question standing when the turn ends on it", async () => {
    const { org, ferro, tool, send, issue, progress } = await hooked();
    await tool("mcp__edict__get_issue", { issue: issue.identifier });
    await ferro.client.post(`${org}/issues/${issue.identifier}/progress`, { state: "needs_input", message: "Google or GitHub first?" });
    await tool("mcp__edict__post_progress", { issue: issue.identifier, state: "needs_input", message: "Google or GitHub first?" });
    await send({ hook_event_name: "Stop", last_assistant_message: "Which provider first?" });
    expect((await progress()).map((u) => u.state)).toEqual(["needs_input", "working"]);
  });

  it("lets a closed issue go: no picking it up, and no more reports on it", async () => {
    const { org, ferro, tool, send, issue, status, progress } = await hooked();
    await tool("mcp__edict__get_issue", { issue: issue.identifier });
    await ferro.client.patch(`${org}/issues/${issue.identifier}`, { version: issue.version, statusId: status("done").id });
    await tool("mcp__edict__update_issue", { issue: issue.identifier, version: issue.version, status: "Done" });
    await tool("Bash", { command: 'git commit -m "Next thing"' }, { stdout: "[main 1234567] Next thing", stderr: "" });
    await send({ hook_event_name: "Stop", last_assistant_message: "On to the next." });
    expect((await progress()).map((u) => [u.source, u.message])).toEqual([
      ["activity", "Moved to Done"],
      ["hook", "Picked up"],
    ]);
  });

  it("posts working when a session with an issue resumes or compacts", async () => {
    const { tool, send, issue, progress } = await hooked();
    await send({ hook_event_name: "SessionStart", source: "startup" });
    expect(await progress()).toEqual([]);
    await tool("mcp__edict__get_issue", { issue: issue.identifier });
    await send({ hook_event_name: "Stop", last_assistant_message: "Paused here." });
    await send({ hook_event_name: "SessionStart", source: "resume" });
    expect((await progress())[0]).toMatchObject({ source: "hook", state: "working", message: "Resumed" });
  });

  it("follows the session from issue to issue", async () => {
    const { owner, org, eng, ferro, tool, send, issue, progress } = await hooked();
    const next = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Second", delegateId: ferro.id })).body;
    await tool("mcp__edict__get_issue", { issue: issue.identifier });
    await tool("mcp__edict__get_issue", { issue: next.identifier });
    await send({ hook_event_name: "Stop", last_assistant_message: "Second is done." });
    expect((await progress(next.identifier)).map((u) => u.state)).toEqual(["done", "working"]);
    expect((await progress()).map((u) => u.state)).toEqual(["working"]);
  });

  it("acts for a connected agent on behalf of its person", async () => {
    const { t, owner, org, orgId, ownerId, eng } = await setup();
    const claude = bearerClient(t.baseUrl, (await connect(t.baseUrl, owner, orgId)).accessToken);
    const agentId = (await claude.get("/organizations")).body[0].member.id as string;
    const key = (await owner.post(`${org}/agents/${agentId}/api-keys`, { name: "laptop", scope: "hooks" })).body.secret as string;
    const mine = (await owner.post(`${org}/teams/${eng.id}/issues`, { title: "Mine", delegateId: agentId })).body;
    const res = await fetch(`${t.baseUrl}/api/v1${org}/agent-hooks/claude-code`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s9", hook_event_name: "PostToolUse", tool_name: "mcp__edict__get_issue", tool_input: { issue: mine.identifier } }),
    });
    expect(res.status).toBe(204);
    const events = (await owner.get(`${org}/events`)).body as { type: string; actorId: string; onBehalfOfId: string | null }[];
    expect(events.find((e) => e.type === "progress.posted")).toMatchObject({ actorId: agentId, onBehalfOfId: ownerId });
  });

  it("is for agents", async () => {
    const { owner, org } = await setup();
    const res = await owner.post(`${org}/agent-hooks/claude-code`, { session_id: "s1", hook_event_name: "Stop" });
    expect(res.status).toBe(403);
  });
});
