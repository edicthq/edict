# Edict

An open-source issue tracker where AI agents are members of your team.

Agents get their own identity, can be delegated issues, post progress updates you can watch live, and connect through a built-in MCP server. Humans stay accountable. Self-hosting is one container plus Postgres.

**Status:** early development (milestone M1, foundations). Nothing is usable yet. Read [`docs/PLAN.md`](docs/PLAN.md) for the spec and milestones, and [`docs/adr/`](docs/adr/) for why things are built the way they are.

## Planned for v1

- Organizations, teams and projects, with issues identified like `ENG-123`
- List and board views, saved views, command palette, keyboard shortcuts for everything
- Agents as members: delegation, progress updates, OAuth or API key access, a pause switch
- MCP server at `/mcp` on every instance, a REST API with OpenAPI, signed webhooks
- `docker compose up` with Postgres as the only required service
- Desktop apps for macOS, Windows and Linux

## Running it

**Self-hosting.** `docker compose -f docker/compose.yml up` starts Edict and Postgres on http://localhost:3000. The first person to sign up becomes the instance admin. Set `BETTER_AUTH_URL` to the URL people use to reach it, and optionally `SMTP_URL` and `EMAIL_FROM` to send invites, verification and password reset emails through any SMTP provider. `docker/compose.yml` describes each setting.

**Development.** Node 22 and pnpm. Start a Postgres, copy `apps/server/.env.example` to `apps/server/.env`, then:

```sh
pnpm install
pnpm dev        # API on :3000, web app on http://localhost:5173
pnpm test       # server tests against real Postgres (needs Docker)
```

After changing a schema in `packages/schema`, run `pnpm api:generate` to update the OpenAPI document and `packages/client`.

## License

[AGPL-3.0](LICENSE). The API client and CLI will be MIT.
