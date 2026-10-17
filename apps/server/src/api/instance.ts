import { createRoute } from "@hono/zod-openapi";
import { InstanceSettings, UpdateInstanceSettings } from "@edicthq/schema";
import { readInstanceSettings, setSignUpMode } from "../instance.js";
import { body, errors, json, router, signedIn, type ApiDeps } from "./context.js";
import { forbidden } from "./errors.js";

const getInstance = createRoute({
  method: "get",
  path: "/instance",
  tags: ["Instance"],
  summary: "The instance's public settings",
  description: "Readable without signing in, so the sign-up page can say whether it needs an invite.",
  responses: {
    200: json(InstanceSettings, "Instance settings"),
  },
});

const updateInstance = createRoute({
  method: "patch",
  path: "/instance",
  tags: ["Instance"],
  summary: "Change instance settings",
  description: "Instance admins only.",
  request: body(UpdateInstanceSettings),
  responses: {
    200: json(InstanceSettings, "The settings after the change"),
    ...errors("invalid_request", "unauthorized", "forbidden"),
  },
});

export function instanceRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(getInstance, async (c) => {
    const settings = await readInstanceSettings(deps.db);
    return c.json({ signUpMode: settings.signUpMode }, 200);
  });

  app.openapi(updateInstance, async (c) => {
    const user = signedIn(c);
    if (!user.instanceAdmin) {
      throw forbidden("Only instance admins can change instance settings.");
    }
    const input = c.req.valid("json");
    if (input.signUpMode) {
      await setSignUpMode(deps.db, user.id, input.signUpMode);
    }
    const settings = await readInstanceSettings(deps.db);
    return c.json({ signUpMode: settings.signUpMode }, 200);
  });

  return app;
}
