---
status: accepted
---

# Old identifiers resolve through key and number history

[ADR 0002](./0002-teams-own-issues.md) requires every identifier an issue ever had to keep resolving after the issue moves to another team or its team key changes. Agents hold identifiers in their context, and pull requests quote them, so a dead `ENG-123` breaks work already in flight.

We store the history instead of rewriting it:

- **Team keys.** A `team_keys` table holds every key a team has had, one row per key, unique within the organization. Renaming a team adds a row. An old key stays reserved to its team: another team cannot take it, though the same team can switch back to it. Renaming a key writes one row, however many issues the team has.
- **Issue numbers.** Each team has a counter that only goes up, so a number is never given out twice in a team, even after an issue moves away or is purged. An `issue_numbers` table holds every (team, number) an issue has held. Creating an issue writes one row, and moving it writes another; the old row stays.
- **Resolving `ENG-123`.** Find the team in `team_keys`, then the issue in `issue_numbers` by that team and 123. The issue's current identifier is always its team's current key plus its current number.

Every endpoint that takes an issue accepts its UUID or any identifier it has had. The response always carries the current identifier, so a client that sent an old one can see that it changed. The web app replaces an old identifier in the URL with the current one. MCP tools resolve identifiers the same way, through the API.

## Considered options

- **One alias row per identifier.** Simple to read, but renaming a key would write one row per issue in the team, inside one transaction.
- **Redirect only the latest move.** Breaks the second time an issue moves, and nothing in an agent's context says which identifier is the newest.
- **Free a retired key after some time.** Would let a new team silently take over old identifiers, so an agent asking for `ENG-12` would get an unrelated issue. Reserving keys costs an admin a few letters.

## Consequences

- Taking the next number locks the team's counter row until the transaction commits, which serializes issue creation within one team. That is fine at issue-tracker write rates.
- Purging an issue from the trash keeps its `issue_numbers` rows, pointing at nothing, so the number is never reused and the identifier answers 404 instead of naming a different issue.
- Permanently deleting a team releases its keys.
