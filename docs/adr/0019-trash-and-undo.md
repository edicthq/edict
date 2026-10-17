---
status: accepted
---

# Undo runs on the server, over the event log

The plan promises undo (⌘Z and the toast button) for any action you just took, bulk edits included, and a 30-day trash for deleted issues, comments, projects and teams.

**Changes.** Everything one request does happens in one transaction (`inScope`), and that transaction is one change. `inScope` gives each transaction a change id, and every event it emits carries it. A bulk edit of twenty issues is one change with twenty events.

**Undo.** `POST /api/v1/organizations/{orgId}/changes/{changeId}/undo` applies the inverse of each event in the change, as a new change whose events say which change they undo. Creating an issue is undone by moving it to the trash, deleting by restoring, and editing a field by setting the old value back. A field is set back only if it still holds the value the change wrote, using the per-field versions from [ADR 0018](./0018-field-level-versions.md). If anything changed it since, the whole undo fails with `409` listing those fields and applies nothing. Undoing an undo redoes the change. Only the actor of a change can undo it in M2.

**Trash.** Deleted issues and comments keep their rows with `deleted_at` and `deleted_by`, and disappear from every list, search and count. Deleting an issue trashes its sub-issues and comments in the same change, and restoring brings them back together. A trashed issue's identifier answers `410 Gone`, saying it is in the trash and how to restore it, so an agent holding it learns what happened. A scheduled job purges rows 30 days after deletion. Events about a purged issue stay in the log.

## Considered options

- **Undo in the client, by sending the inverse request.** Less server code, but a bulk undo would be twenty requests that can half-succeed, the MCP server and CLI would each rebuild it, and it would not build toward per-agent revert ([ADR 0005](./0005-transactional-event-log.md)), which is the same inverse-of-events operation filtered by actor and time.
- **A separate undo journal.** Would duplicate what the event log already records, and could drift from it.
- **Hard delete with an undo window.** No answer for "an agent deleted this yesterday".

## Consequences

- Every event must record enough to invert it: an update stores the old and new value of each field it changed.
- The scheduled purge is the first background job. It runs on pg-boss, which M3's webhook deliveries need anyway.
- Projects and teams use the same trash when they arrive.
