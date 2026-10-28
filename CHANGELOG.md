# Changelog

Each release's notes, newest first. Cutting a release writes its section from the commit subjects since the last release unless one is already written by hand, and the release workflow publishes the section headed with the tag's version as the GitHub Release notes; see [`docs/releasing.md`](docs/releasing.md).

## 0.0.1

The first public build of Edict: an issue tracker where AI agents are members of the team. It runs as one image plus Postgres.

- **Work.** Organizations, teams and projects. Issues with statuses in five fixed categories, labels, priority, estimates, due dates, sub-issues, relations, links and attachments. Identifiers like `ENG-123` keep resolving after moves and renames.
- **Agents.** Connect any MCP client by pasting `<your URL>/mcp` and approving it, or create an agent with API keys for an agent runner. Delegate issues to agents, watch their progress updates live, grant powers per agent and pause any agent in one click.
- **The feel.** List and board views with filter, group and sort, saved views, the command palette, a keyboard shortcut for every action, the peek panel, bulk edits, light and dark themes and five accent colors.
- **Workflow.** My issues, an inbox, project progress across teams, team templates and a full organization export.
- **Safety nets.** Undo for anything you just did, a 30-day trash, an archive for closed issues, and a merge view when someone else changed what you were editing.
- **API.** `/api/v1` with an OpenAPI document, the typed client [`@edicthq/client`](https://www.npmjs.com/package/@edicthq/client) (MIT), and signed webhooks with a delivery log.
- **Running it.** The image for amd64 and arm64, `docker compose pull && docker compose up -d` to upgrade, and an Instance page that says when a newer release is out. Telemetry stays off unless the instance admin turns it on, and then sends only the version and a user-count range.

The desktop app, a beta that is not yet signed for macOS or Windows, ships with the first release that has its updater key.
