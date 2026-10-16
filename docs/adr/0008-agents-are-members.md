# Agents are members, and delegates rather than assignees

Agents are organization members with their own identity, team access, tokens and avatar, instead of borrowing a human's API token. On an issue the human stays the assignee, who answers for the work, and the agent is the delegate, who does it. Every event records the agent and, when a human approved the agent through OAuth, who it acted on behalf of. This keeps accountability with people, makes agent work visible and revocable per agent, and lets an admin pause one agent without touching anyone else.

## Consequences

Permission checks treat agents as a member kind with stricter defaults: no deletes, no settings, no member management unless an admin grants them.
