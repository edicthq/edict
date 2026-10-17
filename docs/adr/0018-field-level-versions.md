---
status: accepted
---

# Writes carry a version, and issues conflict only on the fields they touch

Refines [ADR 0012](./0012-optimistic-versioning-not-coediting.md), which says every write carries the version it started from and a stale write gets `409 Conflict`.

Every mutable resource (issue, comment, status, label, team) has an integer `version` that goes up by one on each change and comes back in every response. Every update request must send the `version` it read. The server returns `409 Conflict` when the write is stale, with the current resource and the fields in conflict, so the caller can re-read and retry, or a human can resolve it in the merge view.

For issues, "stale" means that a field in the request changed after the version the caller read. The issue row keeps, per field, the version that last changed it. If a human edits the title while an agent moves the issue to In Review, both writes succeed. If both change the status, the second gets `409`. Comments, statuses, labels and teams are small and rarely edited at once, so they compare the whole version.

The server treats humans and agents the same. "A human gets a merge view, an agent must re-read" is what each client does with the same `409`.

## Considered options

- **Whole-issue versions.** Simpler, but agents change issues all the time (status, delegate, labels, progress), so humans editing a description would keep hitting conflicts their edits do not have.
- **`If-Match` with an ETag header.** Standard HTTP, but a body field shows up in the Zod schema, the OpenAPI spec and the MCP tool input, which is where agents look. Agents reliably fill fields they can see and forget headers.
- **Version optional, last write wins without it.** Every client would start leaving it out, which is what ADR 0012 rules out.

## Consequences

- MCP tools that update an issue take the version from the issue they read, and their descriptions say to re-read on conflict.
- Undo ([ADR 0019](./0019-trash-and-undo.md)) uses the same per-field versions to tell whether a field still holds the value the change set.
- Deletes do not need a version. They go to the trash and can be restored.
