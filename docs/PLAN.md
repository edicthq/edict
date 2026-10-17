# Edict plan

Edict is an open-source, self-hostable issue tracker where AI agents are members of the team, not API afterthoughts. Linear sets the bar for polish. Edict should clear it, with its own look.

This document is the spec agreed on 2026-10-16. The why behind the big calls lives in [`docs/adr/`](./adr/). Vocabulary lives in [`GLOSSARY.md`](../GLOSSARY.md).

## Goals

1. A team of humans and agents can plan, track and ship work in Edict every day.
2. Self-hosting is `docker compose up` with one app image and Postgres.
3. Any MCP client (Claude Code, Claude Desktop, Cursor, Codex) connects by pasting one URL.
4. Every interaction answers in under 100ms on the client. Filtering, sorting, grouping and navigation never wait on the network.

Not goals for v1: offline mode, real-time co-editing of descriptions, custom fields, languages other than English.

## Product

### Hierarchy

- **Organization** is the top-level tenant. One user can belong to many.
- **Team** belongs to an organization. It has a key (`ENG`), its own workflow statuses, labels and members. Teams can be private.
- **Issue** belongs to exactly one team and gets an identifier from it (`ENG-123`).
- **Project** is a goal with a lead, target date and status. It can hold issues from any team.
- Cycles, initiatives and sub-teams come after v1.

### Issues

- Fields: title, description, status, priority, estimate, due date, assignee, delegate, labels (organization-wide and team), project, parent issue.
- Sub-issues through the parent field.
- Relations: blocks / blocked by, related, duplicate of.
- Comments and descriptions are markdown, edited in Tiptap.
- Attachments go to local disk by default and S3 when configured.
- Team templates prefill title, description and labels.
- No custom fields. Labels cover most needs, and each custom field makes the agent API harder to use.

### Statuses

Each team names its own statuses, and every status maps to one fixed category: Backlog, Todo, In Progress, Done, Canceled. Filters, agents and project progress reason about categories, so "move to In Progress" means the same thing in every team.

### Identifiers

- Internal IDs are UUIDv7. Humans and agents use identifiers like `ENG-123`.
- Moving an issue to another team gives it a new identifier. The old one keeps resolving in URLs, the API and MCP.
- Renaming a team key keeps every old identifier resolving.

### Members and roles

| Role | Can |
|---|---|
| Owner | Everything, including billing hooks and deleting the organization |
| Admin | Manage members, teams, agents, webhooks and settings |
| Member | Work in every public team and the private teams they belong to |
| Guest | Work only in the teams they were invited to |

Invites go out as email links, or as copyable links when SMTP is off. An optional domain rule lets anyone with a matching verified email join.

### Safety nets

- Soft delete. Deleted issues, comments, projects and teams sit in the trash for 30 days.
- Undo (⌘Z and the toast button) for any action you just took, bulk edits included.
- Optimistic versioning. Every write carries the version it started from. A stale write from a human opens a merge view. A stale write from an agent gets `409 Conflict` and must re-read.

### UX in v1

- Command palette (⌘K) and a keyboard shortcut for every action.
- List and board views with filter, group and sort, plus saved views.
- My issues and an inbox for mentions, assignments, delegations and agent progress.
- Issue peek panel that opens without leaving the list.
- Bulk select and edit.
- Light and dark themes, and a per-user accent color (violet, blue, teal, pink, lime); admins set the organization default that new members start from.
- Project overview with progress by status category.
- Full organization export (JSON plus an attachments zip).

After v1: importers (Linear first, then GitHub Issues and Jira), email notifications, import of our own export format.

## Agents

### Agents are members

An agent is a member of an organization with kind `agent`. Edict never runs agents. It tracks their work and shows it. See [ADR 0008](./adr/0008-agents-are-members.md).

An agent joins an organization in one of two ways ([ADR 0015](./adr/0015-oauth-connections-create-agents.md)):

- **Connected agent.** A human connects an MCP client (Claude Code, Codex, OpenCode, T3 Code) to `/mcp` and approves it through OAuth. Edict creates an agent for that connection, named after the client and the human: "Claude Code (Amirali)". It can never do more than its human, so its team access is the human's, narrowed by the guardrails below. Reconnecting the same client as the same human reuses the agent. When the human leaves the organization, their connected agents are paused.
- **Admin-created agent.** An admin creates it with a name, avatar, description and its own team access, and gives it API keys. Agent runners (a server running Claude Code headless or the Agent SDK, a GitHub Action, CI) use these.

Admins can rename, pause and merge any agent. A merge leaves the event log untouched, and the merged agent becomes an alias of the one it merged into.

The event log records every action as "Agent X on behalf of Y" when a human approved the agent through OAuth ("Claude Code (Amirali) on behalf of Amirali"), or "Agent X" when the agent acted with an API key.

### Delegation

On an issue, the **assignee** is the human who answers for it. The **delegate** is the agent doing the work.

Delegating an issue to an agent puts it in that agent's queue, and `my_work` returns it. The everyday flow is a human telling their own agent "work on ENG-142", or "do my Edict work" to pick up everything in its queue. The agent then works the issue through `get_issue`, `update_issue`, `post_progress` and `link`.

A webhook only wakes an agent sooner. Delegating to an agent with a webhook subscription sends it a delivery, which is how agent runners start right away. A connected agent has no webhook, so it picks the issue up the next time its human asks. Until then the issue shows "Waiting for Claude Code to pick it up". Wherever you choose a delegate, the UI shows how each agent connects and when it will start ("connected by Amirali · picks up work when asked", or "runner · starts right away").

Edict ships no agent runner in v1. The "Connect your agent" docs show how to connect each MCP client and how to point a runner at a webhook.

### Progress updates

Agents post structured progress updates to an issue: a state (working, blocked, needs input, done), a markdown message and optional links such as pull requests. The issue shows a live "agent working" state while updates arrive.

MCP tool descriptions steer agents toward progress updates and comments, and away from rewriting the description.

### Authentication

- OAuth 2.1 for MCP clients, as the MCP spec requires for remote servers. A human approves the connection, Edict creates or reuses that human's connected agent for the client, and the agent acts on the human's behalf.
- API keys for admin-created agents (agent runners, CI, scripts). Each key belongs to one agent and is scoped to teams.

### Guardrails

- By default agents can create, read and update issues, comment, post progress, link, relate and change status in teams they can access.
- By default agents cannot delete anything, change team or organization settings, manage members or create agents. An admin can grant each of these per agent.
- Rate limits: 600 requests per minute per token, and 60 issues created per hour per agent. Both are configurable.
- The pause switch revokes every token an agent holds, OAuth grants included, and stops its webhooks in one click.
- Per-agent revert ("undo everything Agent X did in the last hour") comes right after v1, built on the event log.

### MCP server

The server hosts MCP at `/mcp` (Streamable HTTP). Every instance has one with no extra setup.

Tools are shaped around tasks, not endpoints. They accept human values ("In Progress", "@amirali", "bug") and the server resolves them. Errors list the valid options.

| Tool | Does |
|---|---|
| `search_issues` | Full-text and filtered search |
| `get_issue` | One issue with comments, relations and recent progress |
| `create_issue` | Create in a team, optionally from a template |
| `update_issue` | Change status (name or category), assignee, delegate, labels, priority, estimate, project |
| `comment` | Add a markdown comment |
| `post_progress` | Post a progress update |
| `my_work` | Issues assigned or delegated to the caller |
| `list_teams` | Teams the caller can access |
| `get_team_context` | A team's statuses, labels, members and templates |
| `get_project` | Project with its issues and progress |
| `link` | Attach a pull request or URL |
| `relate_issues` | Add a blocks, related or duplicate relation |

Resources: `edict://issue/ENG-123`, `edict://project/<slug>`. Prompts: "triage my inbox", "plan this project into issues".

### Webhooks

- Subscriptions at the organization level and per agent. An agent with a subscription automatically receives events for issues delegated to it. This is how agent runners wake up. Connected agents have none.
- HMAC-SHA256 signature header on every delivery.
- At-least-once delivery. Each payload carries an event ID for deduplication.
- Exponential backoff for about 24 hours, then the subscription disables itself and alerts admins.
- A delivery log in the UI with request, response and a redeliver button.

## Architecture

### Stack

| Concern | Choice |
|---|---|
| Language | TypeScript everywhere |
| Runtime and tooling | Node 22, pnpm, Turborepo |
| Server | Hono with `@hono/zod-openapi` |
| Database | Postgres with Drizzle |
| Jobs | pg-boss |
| Realtime | WebSocket, fanned out across instances with Postgres `LISTEN/NOTIFY` |
| Search | Postgres full-text search plus `pg_trgm` |
| Auth | Better Auth |
| Web client | Vite, React, Tailwind, Radix, TanStack DB on TanStack Query |
| Editor | Tiptap, round-tripping markdown |
| Desktop | Tauri 2 |
| Docs | Fumadocs |

### Repository layout

```
apps/server      Hono API, /mcp, WebSocket, serves the web build
apps/web         Vite + React SPA
apps/desktop     Tauri 2 shell
apps/docs        Fumadocs site
packages/schema  Zod schemas, the source of truth for the API
packages/client  Typed API client generated from OpenAPI, published to npm
packages/ui      Design system
packages/db      Drizzle schema and migrations
docker/          Dockerfile and compose files
```

The CLI arrives after v1 as `apps/cli`.

### One API

Zod schemas in `packages/schema` generate the OpenAPI spec. The spec generates `packages/client`. The web app, the MCP server and the future CLI all call the server through that client, so none of them can drift from the API.

The public API lives under `/api/v1`. Breaking changes only ship in a new major version.

### Event log

Every change writes an append-only event in the same transaction as the change itself. That log drives issue history, realtime pushes, inbox notifications, webhook deliveries and the agent audit trail. See [ADR 0005](./adr/0005-transactional-event-log.md).

### Client data

Opening a team loads its open issues into TanStack DB collections in the browser. Filtering, sorting, grouping and board views run locally. Mutations apply optimistically and WebSocket events patch the collections. Closed and archived issues page in from the server for large teams.

### Multi-tenancy

Every tenant-owned row carries `org_id`. One data-access layer enforces it on every query, and Postgres row-level security backs it up. See [ADR 0006](./adr/0006-multi-tenant-from-day-one.md).

### Human authentication

- Email and password, magic link, Google and GitHub OAuth, generic OIDC (Authentik, Keycloak).
- SMTP is optional. Without it, invites become copyable links and magic links turn off.
- The first user to sign up becomes the instance admin.

### Instance admin

Sign-up mode (open, invite-only, domain), SMTP, storage, the user list, the update check and telemetry. The update check reads GitHub releases and can be turned off.

### Telemetry

Opt-in and off by default. The instance admin page shows the exact payload: version and a user-count bucket.

## Self-hosting

- `docker compose up` runs one app image (API, web, MCP) and Postgres.
- Redis and S3 are optional and only matter at scale.
- Migrations run on boot behind a Postgres advisory lock, so several replicas can start safely.
- Images publish to GHCR with tags `latest`, `1`, `1.4` and `1.4.2`.
- Upgrading is `docker compose pull && docker compose up -d`.

## Desktop

The Tauri app is a shell. It loads the UI from the server the user points it at, so the UI always matches the server version. Native extras: global quick-create hotkey, OS notifications, `edict://` deep links, tray icon, auto-update. Signing into several servers comes after v1.

There is no Apple Developer ID or Windows signing yet, so v1 ships unsigned and labeled beta:

- macOS through the `amiralibg/tap` Homebrew cask, which clears the quarantine flag on install the same way the Wake cask does. The direct `.dmg` download links an "Open Anyway" guide.
- Windows `.msi` and `.exe` through Scoop and winget. Users see a SmartScreen prompt.
- Linux AppImage, `.deb` and `.rpm`.

The Tauri updater signs updates with its own free key, so updates are verified even without OS signing. Signing the apps is a later milestone, triggered when there are users or money.

The web app is the primary client. Test it in WebKit from day one, since the desktop app renders in WebKit on macOS and Linux.

## Design

Linear is the bar for polish, not a look to copy. M0 prototypes two directions on the same three screens (issue list and board, issue detail with agent activity, command palette):

- **Calm precision.** Quiet neutrals, one confident accent, dense rows, almost no decoration.
- **Agent-native.** The human and agent split is part of the visual language. Agents get their own color and texture, and live agent work streams and pulses.

The chosen direction becomes design tokens in `packages/ui` before any product UI is built. Light and dark ship together. Each user picks the accent color; an admin can set the organization default. The tokens with their presets live in [`docs/design/tokens.md`](./design/tokens.md).

### Logo and app icon

Edict has no real logo yet. The hexagon mark in the app and the favicon is the M0 prototype's placeholder, drawn in the agent color, so it changes with the accent. Edict needs a designed logo and app icon before v1.0. The icon has to work in one color and at 16px, without depending on the accent: favicon, desktop app and tray icons for macOS, Windows and Linux, and the avatars for the GitHub org, GHCR and npm. The desktop app in M6 cannot ship without it.

## Quality

- Server: integration tests against real Postgres with Testcontainers, through HTTP. Few mocks.
- MCP: contract tests that run the real tools against a seeded instance.
- Web: Vitest for logic, Playwright end-to-end in Chromium and WebKit.
- Test-first for server and domain logic. UI tests can follow the code.
- GitHub Actions: lint, typecheck, tests, Docker image to GHCR, Tauri builds for macOS, Windows and Linux.

## Project

- License: AGPL-3.0 for the server and apps, MIT for `packages/client`, the CLI and MCP config examples. Contributors sign a CLA through CLA Assistant, set up before the first outside pull request. See [ADR 0001](./adr/0001-agpl-with-cla.md).
- The repo is public from the first commit.
- Commits carry no `Co-Authored-By` trailers.
- Outside contributors file bugs in GitHub Issues. Once the dogfood instance runs, an agent triages GitHub Issues into Edict.
- The dogfood instance and the docs site run on the VPS through Dokploy.

### Name

| Asset | Value | State on 2026-10-16 |
|---|---|---|
| GitHub org | `edicthq` | Free, reserve now |
| Domain | `edict.dev` | Free, reserve now |
| npm scope | `@edicthq` | Free, reserve now. `@edict` belongs to an unrelated reactive-programming library, and the unscoped `edict` package is taken |
| Docker image | `ghcr.io/edicthq/edict` | Comes with the org |
| CLI command | `edict` | |
| MCP resource scheme | `edict://` | |

## Milestones

Week 1 starts Monday 2026-10-19. Estimates assume one developer working with AI agents.

| # | Milestone | Weeks | Scope | Exit criterion |
|---|---|---|---|---|
| M0 | Prototype | 1 | Clickable prototype of the three core screens in both directions | A direction is picked and its tokens are written down |
| M1 | Foundations | 2–3 | Monorepo, Docker Compose, Postgres and Drizzle, migrations on boot, Better Auth, organizations, teams, members, roles, invites, instance admin, event log, CI | `docker compose up`, sign up, create an organization and a team, invite someone |
| M2 | Core issues and API | 4–6 | Issues, identifiers and redirects, statuses and categories, labels, priority, estimates, sub-issues, relations, markdown comments, attachments, soft delete, undo, optimistic versioning, `/api/v1`, OpenAPI, generated client, plain functional UI | The full issue lifecycle works through the UI and the API |
| M3 | Agents | 7–8 | Agent members, connected agents created on OAuth for MCP, API keys, `/mcp` tools, resources and prompts, delegate, progress updates, webhooks and delivery log, guardrails, pause switch | Claude Code connects by URL and works an issue from start to finish. Release v0.1 "agent preview". Edict's own work moves into Edict |
| M4 | The feel | 9–11 | TanStack DB collections, realtime, list and board, filter, group, sort, saved views, ⌘K, shortcuts, peek panel, bulk edit, themes, final visual design | Feels faster than Linear on the dogfood data |
| M5 | Workflow | 12–13 | Projects and overview, My issues, inbox, templates, export | A small team runs on it every day |
| M6 | v1.0 | 14–15 | Logo and app icon, Tauri shell and unsigned distribution, docs site with "Connect your agent" pages, telemetry, update check, release pipeline | v1.0 is public, around 2027-01-29 |

Agents come before polish on purpose. From M3 on, Edict's own development runs in Edict, so the agent workflow gets real use before the UI gets its final coat.

### After v1

Cycles, CLI, git integration (branch names and pull requests move issues), importers, email notifications, per-agent revert, import of our own export format, the GitHub Issues triage agent, signing the desktop apps, signing into several servers from the desktop app, custom fields if users ask for them.
