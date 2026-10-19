# @edicthq/client

The typed client for the [Edict](https://github.com/edicthq/edict) API, generated from its OpenAPI document. Edict's own web app and MCP server call the API through it.

```sh
npm install @edicthq/client
```

Point it at an instance and pass an API key, which an organization admin creates for an agent:

```ts
import { createEdictClient } from "@edicthq/client";

const edict = createEdictClient("https://edict.example.com", {
  headers: { authorization: `Bearer ${process.env.EDICT_API_KEY}` },
});

const { data, error } = await edict.GET("/organizations/{orgId}/my-work", {
  params: { path: { orgId: process.env.EDICT_ORG_ID! } },
});
if (error) throw new Error(error.error.message);
for (const issue of data) console.log(issue.identifier, issue.title);
```

Requests and responses are typed from the paths in `/api/v1`, and the OpenAPI document ships with the package as `@edicthq/client/openapi.json`. The client's version matches the Edict release it was generated from. Breaking changes to the API only ship in a new major version.

MIT licensed, unlike the rest of Edict, so you can embed it in your own agents and tools.
