import { createRoute } from "@hono/zod-openapi";
import { InstanceSettings, UpdateInstanceSettings } from "@edicthq/schema";
import { hasUsers, readInstanceSettings, setSignUpMode } from "../instance.js";
import type { Database } from "@edicthq/db";
import { body, errors, json, router, signedIn, type ApiDeps } from "./context.js";
import { forbidden } from "./errors.js";

const getInstance = createRoute({
  method: "get",
  path: "/instance",
  tags: ["Instance"],
  summary: "The instance's public settings",
  description:
    "Readable without signing in, so the sign-up page can say whether it needs an invite, and a fresh instance can send its first visitor to sign up.",
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
    return c.json(await publicSettings(deps.db), 200);
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
    return c.json(await publicSettings(deps.db), 200);
  });

  return app;
}

async function publicSettings(db: Database) {
  const settings = await readInstanceSettings(db);
  return { signUpMode: settings.signUpMode, setUp: await hasUsers(db) };
}
