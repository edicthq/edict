import { createRoute, z } from "@hono/zod-openapi";
import { asc, count, sql } from "drizzle-orm";
import { user } from "@edicthq/db";
import { InstanceSettings, InstanceStatus, InstanceUsers, UpdateCheck, UpdateInstanceSettings } from "@edicthq/schema";
import { VERSION } from "../version.js";
import type { SignInProviders } from "../env.js";
import { changeInstanceSettings, hasUsers, readInstanceSettings } from "../instance.js";
import { checkForUpdate, RELEASES_URL, updateCheckOf } from "../updates.js";
import { body, errors, json, router, signedIn, type ApiDeps } from "./context.js";
import { forbidden, invalid } from "./errors.js";

type InstanceDeps = ApiDeps & {
  signIn?: SignInProviders;
  // What the status page reports about email and storage.
  instanceInfo?: { emailFrom: string | null; storage: { kind: "disk" | "s3"; location: string } };
  // Where the update check asks for the latest release. GitHub's by default.
  releasesUrl?: string;
};

const getStatus = createRoute({
  method: "get",
  path: "/instance/status",
  tags: ["Instance"],
  summary: "How the instance is set up: email, storage and version",
  description: "Instance admins only.",
  responses: { 200: json(InstanceStatus, "The instance's setup"), ...errors("unauthorized", "forbidden") },
});

const runUpdateCheck = createRoute({
  method: "post",
  path: "/instance/update-check",
  tags: ["Instance"],
  summary: "Check for a newer release of Edict now",
  description: "Instance admins only. Asks GitHub for the latest release, as the daily check does. Refused while the update check is off.",
  responses: {
    200: json(UpdateCheck, "What the check found"),
    ...errors("invalid_request", "unauthorized", "forbidden"),
  },
});

const listUsers = createRoute({
  method: "get",
  path: "/instance/users",
  tags: ["Instance"],
  summary: "Every user on the instance, oldest first",
  description: "Instance admins only.",
  request: {
    query: z.object({
      limit: z.coerce.number().int().min(1).max(200).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  },
  responses: { 200: json(InstanceUsers, "A page of users and how many there are"), ...errors("unauthorized", "forbidden") },
});

function requireInstanceAdmin(c: Parameters<typeof signedIn>[0]) {
  const user = signedIn(c);
  if (!user.instanceAdmin) throw forbidden("Only instance admins can see this.");
  return user;
}

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
  description: "Instance admins only. Answers with the public settings; the update check shows in GET /instance/status.",
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

  app.openapi(getStatus, async (c) => {
    requireInstanceAdmin(c);
    return c.json(
      {
        email: { configured: Boolean(deps.mailer), from: deps.instanceInfo?.emailFrom ?? null },
        storage: deps.instanceInfo?.storage ?? { kind: "disk" as const, location: "" },
        version: VERSION,
        updates: updateCheckOf(await readInstanceSettings(deps.db)),
      },
      200,
    );
  });

  app.openapi(runUpdateCheck, async (c) => {
    requireInstanceAdmin(c);
    if (!(await readInstanceSettings(deps.db)).updateCheck) {
      throw invalid("The update check is off. Turn it on first.");
    }
    return c.json(await checkForUpdate(deps.db, deps.releasesUrl ?? RELEASES_URL), 200);
  });

  // Users are the instance's, not an organization's: an instance admin reads
  // them across every organization, as the jobs do.
  app.openapi(listUsers, async (c) => {
    requireInstanceAdmin(c);
    const { limit, offset } = c.req.valid("query");
    const rows = await deps.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        role: user.role,
        createdAt: user.createdAt,
        organizations: sql<number>`(SELECT count(*)::int FROM members m WHERE m.user_id = "user"."id" AND m.removed_at IS NULL)`,
      })
      .from(user)
      .orderBy(asc(user.createdAt), asc(user.id))
      .limit(limit)
      .offset(offset);
    const [total] = await deps.db.select({ n: count() }).from(user);
    return c.json(
      {
        users: rows.map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          emailVerified: row.emailVerified,
          instanceAdmin: row.role === "admin",
          organizations: row.organizations,
          createdAt: row.createdAt.toISOString(),
        })),
        total: total?.n ?? 0,
      },
      200,
    );
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
    await changeInstanceSettings(deps.db, user.id, input);
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
