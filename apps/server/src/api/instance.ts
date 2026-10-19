import { createRoute } from "@hono/zod-openapi";
import { InstanceSettings, UpdateInstanceSettings } from "@edicthq/schema";
import type { SignInProviders } from "../env.js";
import { hasUsers, readInstanceSettings, setSignUp } from "../instance.js";
import { body, errors, json, router, signedIn, type ApiDeps } from "./context.js";
import { forbidden, invalid } from "./errors.js";

type InstanceDeps = ApiDeps & { signIn?: SignInProviders };

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

export function instanceRoutes(deps: InstanceDeps) {
  const app = router();

  app.openapi(getInstance, async (c) => {
    return c.json(await publicSettings(deps), 200);
  });

  app.openapi(updateInstance, async (c) => {
    const user = signedIn(c);
    if (!user.instanceAdmin) {
      throw forbidden("Only instance admins can change instance settings.");
    }
    const input = c.req.valid("json");
    if (input.signUpMode === "domain" && !deps.mailer) {
      throw invalid("The domain sign-up mode needs email, so Edict can verify that an address really is at the domain. Set SMTP_URL first.");
    }
    if (input.signUpMode === "domain" && !(input.signUpDomains ?? (await readInstanceSettings(deps.db)).signUpDomains).length) {
      throw invalid("Name at least one domain for the domain sign-up mode.");
    }
    await setSignUp(deps.db, user.id, input);
    return c.json(await publicSettings(deps), 200);
  });

  return app;
}

async function publicSettings({ db, mailer, signIn }: InstanceDeps) {
  const settings = await readInstanceSettings(db);
  return {
    signUpMode: settings.signUpMode,
    signUpDomains: settings.signUpDomains,
    setUp: await hasUsers(db),
    sendsEmail: Boolean(mailer),
    signInMethods: {
      magicLink: Boolean(mailer),
      google: Boolean(signIn?.google),
      github: Boolean(signIn?.github),
      oidc: signIn?.oidc ? { name: signIn.oidc.name } : null,
    },
  };
}
