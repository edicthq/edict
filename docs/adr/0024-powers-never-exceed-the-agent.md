---
status: accepted
---

# An agent's powers never exceed the agent

Refines [ADR 0021](./0021-credentials-and-callers.md), which says a grant lifts an agent's role limit for that power alone.

A power lets an agent do a kind of action, not see more or hand out more than it has. Read literally, "lifts the role limit" let an agent with the `agents` power give itself every power, and let one with `settings` read the whole event log, which covers private teams it cannot see. So three rules bound every power:

- **Nothing it lacks.** An agent can give another agent only powers it holds, and a role no higher than its own, so never Admin or Owner. It invites people and sets roles up to its own role. It cannot change its own powers, role or name, and it cannot change or remove a member whose role is above its own.
- **No team it cannot see.** Team ids an agent names when it creates an agent, an API key or an invite must be teams it can see. A private team it cannot see answers as if it did not exist.
- **Nothing that covers every team.** The event log, the organization export and organization-level webhooks see every team at once. They need a caller who sees every team: a person who is an Admin or Owner, or a connected agent whose person is. No power gives that to an admin-created agent. An agent's own webhook stays within the `settings` power, since it only carries what that agent already sees.

## Consequences

- An admin-created agent that manages others is bounded by what an admin gave it, so delegating `agents` or `members` cannot snowball.
- A runner that needs the event log reads it through its own webhook, which carries what happens to its issues, instead of through `/events`.
