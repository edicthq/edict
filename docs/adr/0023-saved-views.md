---
status: accepted
---

# Saved views are personal and hold exactly the URL's view

The team page can filter by status, priority, assignee and label, search by words, group by status, priority or assignee, and sort by four keys in either direction ([the M4 plan](../PLAN.md)). A saved view keeps one such arrangement under a name, so a person can get back to it: "My open bugs", "Urgent this week".

**What a view holds.** Exactly the team page's URL view: the question, the sets of statuses, priorities, assignees and labels, the grouping and the sort with its direction, nothing else. The server stores and validates it but does not interpret it — the same client code that applies the URL applies a view, so the two can never drift.

**Who sees one.** Only its owner. A view belongs to one member and one team; nobody else's list changes because someone saved a view. Sharing a view with the team, or copying it between teams, arrives later and can be built on this table rather than inside it. A view needs no access rules beyond its owner: it reads nothing the member could not already see, and carries no tenant data out of the team page it was made from.

**No identifiers, no trash.** Unlike an issue, a saved view has no identifier anyone depends on: links name teams and issues, and a shared link to a team page does not cite a view's id. Deleting one is immediate — no 30-day trash, no `410 Gone`, nothing to restore.

**Optimistic versions still apply.** A view row carries the version an update started from, as [ADR 0018](./0018-field-level-versions.md) requires, so a stale rename or re-filter fails with `409 Conflict` like any other write instead of silently losing a change from the same person's other tab.

## Considered options

- **Store the URL string, unparsed.** One less validation, but the client URL grammar would become load-bearing storage, and every spelling change to a param would migrate rows.
- **A view per team, shared by everyone.** Pressures the person who saves it ("should I share this?"), and needs visibility flags, notifications and moderation before it is useful.
- **Interpret the query server-side for saved views only.** The server would re-implement matching, grow its own copy of the client rules, and drift.

## Consequences

- `saved_views` carries `org_id` with row-level security (ADR 0006), the owner's member id, the team id, the name, and the query as a JSON object validated by the API schema.
- Every change emits its event (`view.saved`, `view.updated`, `view.deleted`) in the same transaction (ADR 0005). Events are only income for their owner's other tabs; nothing else consumes them.
- The MCP server does not expose views: an agent cannot break a person's saved way of seeing a team, and `update_issue` already covers what agents need.
