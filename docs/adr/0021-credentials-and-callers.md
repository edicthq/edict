---
status: accepted
---

# Three credentials, one caller

Extends [ADR 0008](./0008-agents-are-members.md), [ADR 0014](./0014-better-auth.md) and [ADR 0015](./0015-oauth-connections-create-agents.md).

Every request to `/api/v1`, `/files` and `/mcp` becomes one **caller** before any handler runs. The caller is the member who acts, plus what limits it:

- **Session cookie**: a human member. Team access and role are the member's own.
- **API key** (`Authorization: Bearer edict_ak_…`): an admin-created agent, as itself, with no "on behalf of". The agent's role and team memberships decide what it sees, and a key can narrow that further to a list of teams.
- **OAuth access token** (`Authorization: Bearer edict_at_…`): a connected agent on behalf of the human who approved it. It sees what that human sees, under the agent guardrails.

Handlers see only the caller. They never ask which credential arrived.

## API keys

An API key belongs to one agent in one organization. Edict shows the secret once, and stores its SHA-256 hash and its first characters for display. Keys never expire on their own; an admin revokes them one at a time, and pausing the agent revokes all of them.

## OAuth

Better Auth's OAuth 2.1 provider (`@better-auth/oauth-provider`) issues the tokens. MCP clients register themselves through dynamic client registration and use PKCE. Access tokens are opaque, not JWTs. Edict stores their SHA-256 hash, so it checks a token with one indexed query, and pausing an agent deletes its tokens.

A user can belong to several organizations, but a connected agent belongs to one. The consent page asks which organization to connect, stores the choice on the Better Auth session, and the provider records it as the grant's reference. Every token from that grant carries the organization.

The first request with a new grant creates the connected agent, or reuses the one that matches the organization, the human and the client's registered name. Matching on the name, not the client id, matters because each reconnect registers a new client. That request writes an `agent.connected` event in the same change. A paused agent's tokens get `403`, and reconnecting does not unpause it.

## Guardrails

An agent's role is Member or Guest. A connected agent takes its human's role, lowered to Member if the human is an Admin or Owner, and the human's team access. The human leaving or being removed pauses the agent.

Four powers are off for agents by default, and an admin can grant each one per agent: deleting, changing team and organization settings, managing members, and creating agents. A grant lifts the agent's role limit for that power alone. A connected agent with a grant still never does more than its human: the grant works only while the human could do the same thing.

Each event records the agent as its actor. When the credential is an OAuth token, the human goes in `on_behalf_of_id`. `inScope` sets it for the whole transaction, like the change id, so every event in the change carries it.

## Considered options

- **JWT access tokens.** They are checked without a database read, but they cannot be revoked before they expire, so pause would take up to an hour to bite. Edict reads the database on every request anyway.
- **One connected agent per human and client across all of the human's organizations.** Breaks the rule that every member belongs to one organization ([ADR 0016](./0016-organizations-and-membership.md)).
- **An organization in the MCP URL (`/mcp/<org>`).** Simpler consent, but the plan promises one URL per instance, and a human in two organizations would paste two.
- **Better Auth's API key plugin.** Its keys belong to users, and agents are not users.

## Consequences

- `inOrg` resolves a caller, not a session user. Permission helpers read the caller's team access and grants, not just its role.
- The MCP server holds no credentials of its own. It passes the caller's bearer token to the API through `packages/client`.
- Rate limits count per credential and per agent. They are in [PLAN.md](../PLAN.md#guardrails).
