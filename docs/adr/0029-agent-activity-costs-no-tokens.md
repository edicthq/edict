---
status: accepted
---

# Agents report their work without spending tokens on it

Extends [ADR 0011](./0011-task-shaped-mcp-tools.md) and [ADR 0021](./0021-credentials-and-callers.md).

The agent lane stays. What changes is who pays for it. Measured on 2026-10-20: the 13 tool definitions cost about 2.2k tokens in every session (8.7k characters), and each `post_progress` costs 60–150 tokens of output. The tool descriptions told agents to post when they start, when they get stuck and when they finish, so a plain issue cost three posts on top of the work. Most of what those posts said, Edict could already see: the agent moved the issue, linked a pull request, commented. The rest happens in the client, where hooks run at no token cost.

## Decision

**Activity is progress.** A progress update gets a `source`:

- `agent`: the agent called `post_progress`.
- `activity`: Edict wrote it from something the agent did on the issue.
- `hook`: the agent's client posted it from a hook.

Rows, the lane, the rail, the roster and the freshness rule from EDI-35 read all three the same way. The lane shows `activity` and `hook` entries more quietly than the agent's own words.

**Implicit activity, for every client.** When the delegate of an issue changes its status, links a URL or comments on it, the same change writes an `activity` progress update ([ADR 0005](./0005-transactional-event-log.md)):

| The delegate | State | Message |
|---|---|---|
| Moves it to a Done or Canceled status | done | Moved to Done |
| Moves it to any other status | working | Moved to In Review |
| Links a URL | its latest state, or working | Linked _title_, with the link |
| Comments | its latest state, or working | The comment's first line |

A link or comment keeps a blocked or needs-input state rather than flipping it to working, because the agent often explains its question in a comment. Activity updates make no inbox items: the status change, link or comment already notifies the people it should. Hook updates make one only when they say done. Undoing a change leaves its activity and hook updates in place as a record, and the undo writes none of its own.

**Client hooks, for Claude Code.** Claude Code's HTTP hooks post their JSON input to a URL with a bearer header taken from an environment variable. Edict takes that JSON as it is, at `POST /api/v1/organizations/{orgId}/agent-hooks/claude-code`, and answers with an empty `204`, which Claude Code reads as "carry on":

| Hook | Edict does |
|---|---|
| `PostToolUse` on an `mcp__edict__*` tool that names an issue | Ties the session to that issue. The first tie in a session posts working ("Picked up"), which replaces the start-of-work post |
| `SessionStart` with `source` resume or compact | Posts working on the session's issue |
| `PostToolUse` on `Bash(git commit *)` | Posts working: "Committed _subject_" |
| `PostToolUse` on `Bash(gh pr create *)` | Links the pull request from the command's output, and posts working with it |
| `Stop` | Posts done with the start of `last_assistant_message` (600 characters) |

A session is tied to the issue its latest Edict tool call named, so a session that works three issues in turn reports on each in turn. Only an issue delegated to the agent ties a session: reading another issue does not move its reports there, and an agent that takes on an issue delegates it to itself first. "Picked up" is not posted again when the agent's latest update on the issue already says working. A closed issue neither ties a session nor takes its hooks' reports, so a session that has finished an issue goes quiet until it touches the next. A hook from a session with no issue yet writes nothing. A new session starts working when it first touches an issue, not at `SessionStart`, since a new session has not said which issue it is on. Tying a session writes no event: like an API key's last use, it is bookkeeping, not a change anyone made.

**Hook keys.** A hook needs a credential that sits in the person's shell, and a connected agent's OAuth token lives in the client's own store, out of a hook's reach. So an API key gets a scope: `full`, as today, or `hooks`, which can call only the agent-hooks endpoint. Anyone who may manage an agent can create a hook key for it, and that includes the person who connected a connected agent. A hook key leaking from a settings file lets someone post progress as that agent and nothing more. The Connect page creates one and shows the hook settings to paste, with the key in `EDICT_HOOK_KEY` rather than in the file.

**`post_progress` becomes optional.** The server instructions and tool descriptions steer an agent to post only when it is blocked, when it needs a person, or for a final summary, and say that Edict sees the rest. Every tool description is trimmed, aiming at 1.2k tokens for the 13 tools, about half of today.

## Considered options

- **`update_issue` takes an optional progress message.** One call instead of two, but the message still costs output tokens, and implicit activity already covers the moves that matter.
- **Reading an issue counts as working on it.** `my_work` followed by `get_issue` on five issues would mark all five as being worked.
- **A hook on every tool call as a heartbeat.** It would keep Working fresh through long silent stretches, but it writes a row per tool call or needs a second freshness field beside progress. Commits and the end of each turn come often enough for the half-hour rule.
- **Command hooks running a script.** They need `curl`, `jq` and a script file on the person's machine. HTTP hooks need none of these.
- **Hooks use the agent's full API key.** A connected agent has none, and a full key in a shell profile can do anything the agent can.

## Consequences

- `ProgressUpdate` gains `source`, and `CreateApiKey` gains `scope`. New table `agent_sessions` (organization, agent, session, issue, updated). A contract test covers each MCP and API change.
- The endpoint is shaped around Claude Code's hook input. Other clients with hooks (Codex, OpenCode) get their own path when someone needs them.
- A long run that neither commits nor ends a turn goes quiet after half an hour. That is honest: Edict has heard nothing.
- PLAN.md's progress section and the MCP tool table are updated. GLOSSARY gains **Hook key**.
