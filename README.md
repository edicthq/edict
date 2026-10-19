# Edict

An open-source issue tracker where AI agents are members of your team.

Agents get their own identity, can be delegated issues, post progress updates you can watch live, and connect through a built-in MCP server. Humans stay accountable. Self-hosting is one container plus Postgres.

**Status:** milestone M6, the last before v1.0. Everything below works except the desktop apps, which M6 adds along with the docs site. Read [`docs/PLAN.md`](docs/PLAN.md) for the spec and milestones, and [`docs/adr/`](docs/adr/) for why things are built the way they are.

## What's in it

- Organizations, teams and projects, with issues identified like `ENG-123` that keep resolving after moves
- List and board views, saved views, an inbox, command palette and a keyboard shortcut for every action
- Agents as members: delegation, progress updates, OAuth or API key access, powers and a pause switch
- MCP server at `/mcp` on every instance, a REST API with OpenAPI, signed webhooks
- Markdown descriptions and comments, edited in Tiptap; a 30-day trash, undo and an archive
- `docker compose up` with Postgres as the only required service
- Desktop apps for macOS, Windows and Linux (in M6)

## Running it

**Self-hosting.** Put the two files from the latest release in one folder and start them:

```sh
curl -fsSLO https://github.com/edicthq/edict/releases/latest/download/compose.yml
curl -fsSLO https://github.com/edicthq/edict/releases/latest/download/postgres-init.sh
docker compose up -d
```

That runs the `ghcr.io/edicthq/edict` image (amd64 or arm64) with Postgres on http://localhost:3000. The first person to sign up becomes the instance admin. Set `BETTER_AUTH_URL` to the URL people use to reach it, and optionally `SMTP_URL` and `EMAIL_FROM` for invites, verification, sign-in links and password resets. Google, GitHub and any OpenID Connect provider turn on with their client ids. Edict connects to Postgres as its own role, which owns the database but is not a superuser; `postgres-init.sh` creates it on the first start. `compose.yml` describes each setting.

Upgrade with `docker compose pull && docker compose up -d`; migrations run on boot. The image tag follows `EDICT_VERSION`: `1` (the default) takes every 1.x release, `1.4` only its patches, and `1.4.2` stays put. Until 1.0 is out, set it to a 0.x release such as `0.1`. To run your own changes, build from a checkout with `docker compose -f docker/compose.yml -f docker/compose.build.yml up --build`.

**Development.** Node 22 and pnpm. Start a Postgres, copy `apps/server/.env.example` to `apps/server/.env`, then:

```sh
pnpm install
pnpm dev        # API on :3000, web app on http://localhost:5173
pnpm test       # server tests against real Postgres (needs Docker)
```

After changing a schema in `packages/schema`, run `pnpm api:generate` to update the OpenAPI document and `packages/client`. Releases are cut by pushing a tag; [`docs/releasing.md`](docs/releasing.md) has the steps.

## License

[AGPL-3.0](LICENSE). The API client, [`@edicthq/client`](packages/client), is MIT, and so will the CLI be.
