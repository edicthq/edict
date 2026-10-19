---
status: accepted
---

# Closed issues archive on a team's schedule

The glossary defines the archive as where closed issues go to leave active views while staying searchable, and the plan says a team page loads its open issues while closed and archived ones page in from the server. Without an archive, a team's page loaded every issue it ever had.

- **Closing.** An issue records `closedAt` and `closedBy` when it moves into a Done or Canceled status, and clears both when it moves out.
- **Archiving.** A daily job archives issues closed longer than their team's `archiveAfterDays`, 30 by default. An Admin can set it per team, or turn it off with null. Anyone who can see a closed issue can archive it by hand. Each archive writes `issue.archived`; the job's events name whoever closed the issue as the actor, since nobody acted at that moment, and carry `automatic: true`.
- **What it changes.** An archived issue leaves the team's list and the web app's collection. Its identifier keeps resolving, search finds it with `include=all`, and project progress still counts it. `GET .../teams/{teamId}/issues?archived=true` pages archived issues by number.
- **Coming back.** Reopening an archived issue unarchives it, as its own `issue.unarchived` event in the same change, so undo puts both back. `POST .../unarchive` brings one back by hand.

## Considered options

- **Archive by a fixed rule, with no team setting.** Simpler, but a team that reviews last quarter's work wants its closed issues around longer.
- **Archive as a status category.** It would make "archived" something agents set through `update_issue`, and every status list and filter would need to skip it.
- **Page closed issues without an archive.** Keeps one less concept, but the glossary already promises the archive, and a team would lose recently closed issues from its board.

## Consequences

- The web app keeps only unarchived issues in its TanStack DB collections, so a team's page stays small however long it has run.
- Trashing and archiving are separate: an archived issue can still go to the trash, and a restored one comes back archived.
