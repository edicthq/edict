# Zod schemas drive the API, the client and MCP

The server uses Hono with `@hono/zod-openapi`. Zod schemas in `packages/schema` generate the OpenAPI spec, the spec generates the typed client in `packages/client`, and the web app, MCP server and CLI all call the API through that client. We chose Hono over Express, the usual default, because Express keeps OpenAPI in sync by hand, and drift between the API and what agents see is the failure we most want to rule out.
