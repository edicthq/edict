# Connecting an MCP client creates a connected agent

Extends [ADR 0008](./0008-agents-are-members.md).

When a human connects an MCP client (Claude Code, Codex, OpenCode, T3 Code) through OAuth, Edict creates an agent member for that connection, named after the client and the human: "Claude Code (Amirali)". Its events read "Claude Code (Amirali) on behalf of Amirali". Admin-created agents with API keys stay for agent runners (CI, a headless Claude Code, the Agent SDK). Edict never runs agents. It tracks their work and shows it.

The day-to-day flow is a human telling their own agent "work on ENG-142". That agent needs an identity of its own the moment it connects, without waiting for an admin, and it must not borrow the human's identity, or ADR 0008's accountability and per-agent pause stop working. So a connection creates a connected agent instead of picking an existing one.

## Considered options

- **Admins create every agent, and the human picks one on the OAuth consent screen.** Every new person or new client waits for an admin, and five people sharing one "Claude Code" agent makes its queue and its pause switch meaningless.
- **One shared agent per client ("Claude Code"), with "on behalf of" telling humans apart.** Pausing it pauses everyone's Claude Code, and nobody can tell whose queue a delegated issue is in.
- **No agent: the human acts "via Claude Code".** This breaks ADR 0008. Agent work would show up as human work, and the stricter agent guardrails would not apply.

## Consequences

- A connected agent can never do more than its human. Its team access is the human's, narrowed by the agent guardrails. A guest's Claude Code sees only that guest's teams.
- Reconnecting the same client as the same human (matched by the client's name) reuses the existing agent with fresh tokens, so its history stays in one place. Admins can rename, pause and merge agents to clean up the rest. A merge leaves the event log untouched: the merged agent becomes an alias of the agent it merged into.
- When the human leaves the organization or is removed, their connected agents are paused. The history stays.
- Delegating to a connected agent puts the issue in its queue and nothing more. A connected agent has no webhook endpoint, so it picks the issue up from `my_work` the next time its human asks. Agents served by an agent runner have a webhook that starts them right away. The UI says which kind each agent is wherever you choose a delegate.
- Edict ships no agent runner in v1.
