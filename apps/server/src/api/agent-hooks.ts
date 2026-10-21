// ADR 0029: Claude Code's HTTP hooks post here, so an agent's work shows on
// its issue without the agent spending tokens on it. The body is the hook's
// JSON as Claude Code sends it, and the answer is an empty 204, which Claude
// Code reads as "carry on".
import { createRoute } from "@hono/zod-openapi";
import { and, eq, lt } from "drizzle-orm";
import { agentSessions, emit, issueLinks, type Transaction } from "@edicthq/db";
import { ClaudeCodeHook } from "@edicthq/schema";
import type { Caller } from "./callers.js";
import { body, errors, inOrg, noContent, OrgParams, router, type ApiDeps } from "./context.js";
import { ApiError, forbidden } from "./errors.js";
import { visibleIssue } from "./issue-data.js";
import { latestByAgent, writeProgress } from "./progress.js";

const claudeCode = createRoute({
  method: "post",
  path: "/organizations/{orgId}/agent-hooks/claude-code",
  tags: ["Agents"],
  summary: "Take a Claude Code hook",
  description:
    "Point Claude Code's HTTP hooks here with an agent's hook key. The first Edict tool call naming an issue delegated to the agent ties the session to it and posts working. A `git commit` posts what it committed, `gh pr create` links the pull request, a resumed or compacted session posts working, and Stop posts done with the turn's last message. Anything else is ignored. Answers 204 with no body.",
  request: { params: OrgParams, ...body(ClaudeCodeHook) },
  responses: {
    ...noContent,
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found"),
  },
});

// The Edict tools whose `issue` argument ties a session to an issue. A tool
// is mcp__<server>__<tool>, and people name the server as they like.
const issueTools = new Set(["get_issue", "update_issue", "comment", "post_progress", "link", "relate_issues"]);

const DONE_MESSAGE = 600;
// Sessions nobody has heard from in this long are dropped as others are tied.
const SESSION_DAYS = 30;

export function agentHookRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(claudeCode, async (c) => {
    const { orgId } = c.req.valid("param");
    const input = c.req.valid("json");
    await inOrg(
      deps,
      c,
      orgId,
      async (tx, caller) => {
        if (caller.kind !== "agent") {
          throw forbidden("Hooks come from an agent's client, with the agent's hook key.");
        }
        await takeHook(tx, caller, input);
      },
      { hooks: true },
    );
    return c.body(null, 204);
  });

  return app;
}

async function takeHook(tx: Transaction, caller: Caller, input: ClaudeCodeHook): Promise<void> {
  const session = { orgId: caller.orgId, agentId: caller.id, sessionId: input.session_id };
  switch (input.hook_event_name) {
    case "PostToolUse": {
      const tool = /^mcp__.+__([a-z_]+)$/.exec(input.tool_name ?? "")?.[1];
      const ref = input.tool_input?.issue;
      if (tool && issueTools.has(tool) && typeof ref === "string") {
        await tie(tx, caller, session, ref, { quiet: tool === "post_progress" });
        return;
      }
      if (input.tool_name === "Bash") {
        await afterCommand(tx, caller, session, input);
      }
      return;
    }
    case "SessionStart": {
      if (input.source !== "resume" && input.source !== "compact") return;
      const issueId = await tiedIssue(tx, session);
      if (issueId) await post(tx, caller, issueId, { state: "working", message: "Resumed" });
      return;
    }
    case "Stop": {
      const issueId = await tiedIssue(tx, session);
      if (!issueId) return;
      // A turn that ends on a question leaves it standing.
      const latest = await latestByAgent(tx, issueId, caller.id);
      if (latest?.state === "blocked" || latest?.state === "needs_input") return;
      await post(tx, caller, issueId, { state: "done", message: clip(input.last_assistant_message?.trim() || "Finished", DONE_MESSAGE) });
      return;
    }
    default:
      return;
  }
}

type SessionKey = { orgId: string; agentId: string; sessionId: string };

async function tiedIssue(tx: Transaction, session: SessionKey): Promise<string | null> {
  const [row] = await tx
    .select({ issueId: agentSessions.issueId })
    .from(agentSessions)
    .where(and(eq(agentSessions.agentId, session.agentId), eq(agentSessions.sessionId, session.sessionId)));
  return row?.issueId ?? null;
}

// Ties the session to an issue delegated to the agent, and says it picked the
// issue up unless its latest update there already says working, or holds a
// question the agent has not moved on from.
async function tie(tx: Transaction, caller: Caller, session: SessionKey, ref: string, options: { quiet: boolean }): Promise<void> {
  let issueId: string;
  try {
    const { issue } = await visibleIssue(tx, caller, ref);
    if (issue.delegateId !== caller.id) return;
    issueId = issue.id;
  } catch (error) {
    // An issue the agent cannot see, or one in the trash, ties nothing.
    if (error instanceof ApiError) return;
    throw error;
  }
  const previous = await tiedIssue(tx, session);
  if (previous !== issueId) {
    await tx
      .insert(agentSessions)
      .values({ ...session, issueId })
      .onConflictDoUpdate({ target: [agentSessions.agentId, agentSessions.sessionId], set: { issueId, updatedAt: new Date() } });
    await tx
      .delete(agentSessions)
      .where(and(eq(agentSessions.agentId, caller.id), lt(agentSessions.updatedAt, new Date(Date.now() - SESSION_DAYS * 86_400_000))));
  }
  if (options.quiet) return;
  const latest = await latestByAgent(tx, issueId, caller.id);
  const waiting = latest?.state === "blocked" || latest?.state === "needs_input";
  if (latest?.state === "working" || (waiting && previous === issueId)) return;
  await post(tx, caller, issueId, { state: "working", message: "Picked up" });
}

// git commit and gh pr create, read from what they printed.
async function afterCommand(tx: Transaction, caller: Caller, session: SessionKey, input: ClaudeCodeHook): Promise<void> {
  const command = typeof input.tool_input?.command === "string" ? input.tool_input.command : "";
  const stdout = outputOf(input.tool_response);
  const committing = /\bgit\b[^\n|;&]*\bcommit\b/.test(command);
  const opening = /\bgh\s+pr\s+create\b/.test(command);
  if (!committing && !opening) return;
  const issueId = await tiedIssue(tx, session);
  if (!issueId) return;
  if (committing) {
    // "[branch 1a2b3c4] Subject", or "[branch (root-commit) 1a2b3c4] Subject".
    // Claude Code names the commit it saw in gitOperation. Git prints
    // "[branch 1a2b3c4] Subject" unless -q; then the -m subject, if the
    // command gives one plainly. PostToolUse follows only a command that
    // succeeded.
    const seen = gitCommit(input.tool_response);
    const summary = /\[[^\]\n]*?\b([0-9a-f]{7,40})\] (.+)$/m.exec(stdout);
    const sha = seen?.sha ?? summary?.[1];
    const subject = (summary?.[2] ?? /\s-m\s*(["'])([^"'\n]+)\1/.exec(command)?.[2])?.trim();
    if (sha || (!seen && !/nothing to commit|no changes added/.test(stdout))) {
      const parts = ["Committed", sha ? `\`${sha.slice(0, 7)}\`` : "", subject ? clip(subject, 200) : ""];
      await post(tx, caller, issueId, { state: "working", message: parts.filter(Boolean).join(" ") });
    }
  }
  if (opening) {
    const pull = /https?:\/\/\S+\/pull\/(\d+)/.exec(stdout);
    if (pull) await linkPullRequest(tx, caller, issueId, pull[0], `Pull request #${pull[1]}`);
  }
}

// The link's event says it came from a hook, so the progress it writes is the
// hook's (progress.ts).
async function linkPullRequest(tx: Transaction, caller: Caller, issueId: string, url: string, title: string): Promise<void> {
  const [row] = await tx
    .insert(issueLinks)
    .values({ orgId: caller.orgId, issueId, url, title, creatorId: caller.id })
    .onConflictDoNothing()
    .returning();
  if (!row) return;
  await emit(tx, caller.orgId, {
    type: "link.created",
    actorId: caller.id,
    subjectId: row.id,
    data: { issueId, url, title, creatorId: caller.id, via: "hook" },
  });
}

async function post(tx: Transaction, caller: Caller, issueId: string, update: { state: "working" | "done"; message: string }): Promise<void> {
  await writeProgress(tx, caller.orgId, { issueId, agentId: caller.id, source: "hook", ...update });
}

// Claude Code's Bash answer can say which commit the command made.
function gitCommit(response: unknown): { sha: string } | null {
  const commit = (response as { gitOperation?: { commit?: { sha?: unknown; kind?: unknown } } } | null)?.gitOperation?.commit;
  return typeof commit?.sha === "string" && /^[0-9a-f]{7,40}$/.test(commit.sha) && commit.kind === "committed" ? { sha: commit.sha } : null;
}

// Bash answers with { stdout, stderr }; take any text it holds.
function outputOf(response: unknown): string {
  if (typeof response === "string") return response;
  if (response && typeof response === "object") {
    const { stdout, stderr } = response as { stdout?: unknown; stderr?: unknown };
    return [stdout, stderr].filter((part): part is string => typeof part === "string").join("\n");
  }
  return "";
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
