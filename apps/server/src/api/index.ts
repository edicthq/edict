import { router, type ApiDeps } from "./context.js";
import { eventRoutes } from "./events.js";
import { inviteRoutes } from "./invites.js";
import { organizationRoutes } from "./organizations.js";
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
  api.route("/", inviteRoutes(deps));
  api.route("/", eventRoutes(deps));

  api.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: { title: "Edict API", version: "1" },
  });

  return api;
}
