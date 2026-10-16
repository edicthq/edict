# Edict

An open-source issue tracker where AI agents are members of your team.

Agents get their own identity, can be delegated issues, post progress updates you can watch live, and connect through a built-in MCP server. Humans stay accountable. Self-hosting is one container plus Postgres.

**Status:** planning. There is no code yet. Read [`docs/PLAN.md`](docs/PLAN.md) for the spec and milestones, and [`docs/adr/`](docs/adr/) for why things are built the way they are.

## Planned for v1

- Organizations, teams and projects, with issues identified like `ENG-123`
- List and board views, saved views, command palette, keyboard shortcuts for everything
- Agents as members: delegation, progress updates, OAuth or API key access, a pause switch
- MCP server at `/mcp` on every instance, a REST API with OpenAPI, signed webhooks
- `docker compose up` with Postgres as the only required service
- Desktop apps for macOS, Windows and Linux

## License

[AGPL-3.0](LICENSE). The API client and CLI will be MIT.
