import { router, type ApiDeps } from "./context.js";
import { eventRoutes } from "./events.js";
import { instanceRoutes } from "./instance.js";
import { inviteRoutes } from "./invites.js";
import { issueRoutes } from "./issues.js";
import { labelRoutes } from "./labels.js";
import { organizationRoutes } from "./organizations.js";
import { relationRoutes } from "./relations.js";
import { statusRoutes } from "./statuses.js";
import { teamRoutes } from "./teams.js";

export type { ApiDeps, SessionUser } from "./context.js";

// The public API, mounted at /api/v1. Its OpenAPI document is served at
// /api/v1/openapi.json.
export function createApi(deps: ApiDeps) {
  const api = router();

  api.use(async (c, next) => {
    c.set("user", await deps.getUser(c.req.raw.headers));
    await next();
  });

  api.route("/", organizationRoutes(deps));
  api.route("/", teamRoutes(deps));
  api.route("/", statusRoutes(deps));
  api.route("/", issueRoutes(deps));
  api.route("/", labelRoutes(deps));
  api.route("/", relationRoutes(deps));
  api.route("/", inviteRoutes(deps));
  api.route("/", eventRoutes(deps));
  api.route("/", instanceRoutes(deps));

  api.doc31("/openapi.json", documentConfig);

  return api;
}

const documentConfig = {
  openapi: "3.1.0",
  info: { title: "Edict API", version: "1" },
  servers: [{ url: "/api/v1" }],
};

// The document without a running server. Building routes touches no
// dependency, so stubs are enough. scripts/openapi.ts writes it to
// packages/client, which generates the typed client from it.
export function openApiDocument() {
  return createApi({ db: undefined as never, getUser: async () => null }).getOpenAPI31Document(documentConfig);
}
