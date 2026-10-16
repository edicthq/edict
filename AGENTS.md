# Edict

Edict is an open-source, self-hostable issue tracker where AI agents are team members. The repo is public, so every commit is visible.

## Where things are decided

- **Spec and milestones**: read [`docs/PLAN.md`](docs/PLAN.md) before starting any feature. It says which milestone we are in and what belongs to it. Work outside the current milestone needs the user's go-ahead.
- **Vocabulary**: [`GLOSSARY.md`](GLOSSARY.md). Name code, UI copy, API fields and MCP tools with its terms, and treat its _Avoid_ words as wrong.
- **Architecture decisions**: [`docs/adr/`](docs/adr/). Read the relevant ADR before changing anything it covers. Contradicting an ADR means writing a new ADR that supersedes it, agreed with the user first.

## Invariants

These come from the ADRs and are easy to break by accident:

- Every write to tenant data goes through the data-access layer that enforces `org_id`.
- Every change writes its event in the same transaction as the change.
- The web app, MCP server and CLI call the API only through `packages/client`. Change a Zod schema in `packages/schema`, then regenerate the client.
- Descriptions and comments are markdown end to end.
- Postgres is the only required service. A feature that needs Redis or S3 must still work without them.

## Commits

Write plain commit messages with no `Co-Authored-By` or other attribution trailers.

## Tests

Server and domain logic are test-first, against real Postgres through HTTP. Agents depend on the API and MCP contracts, so a change to either ships with a contract test.
