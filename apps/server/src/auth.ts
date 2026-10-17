import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { admin } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { count, eq } from "drizzle-orm";
import { schema, type Database } from "@edicthq/db";
import { passwordResetEmail, verificationEmail, type Mailer } from "./email.js";
import { maySignUp } from "./instance.js";

export interface AuthConfig {
  secret: string;
  baseURL?: string;
  // See ServerConfig.trustedProxies. The server puts the socket address at the
  // end of X-Forwarded-For before Better Auth reads it (app.ts).
  trustedProxies?: string[];
}

export type EdictAuth = ReturnType<typeof createAuth>;

// Without a mailer there is no email verification and no password reset: an
// instance admin sets a new password instead.
export function createAuth(config: AuthConfig, db: Database, mailer?: Mailer) {
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      sendResetPassword: mailer
        ? async ({ user, url }) => mailer.send(passwordResetEmail({ to: user.email, url }))
        : undefined,
    },
    emailVerification: mailer
      ? {
          sendOnSignUp: true,
          autoSignInAfterVerification: true,
          sendVerificationEmail: async ({ user, url }) => mailer.send(verificationEmail({ to: user.email, url })),
        }
      : undefined,
    plugins: [admin()],
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["x-forwarded-for"],
        trustedProxies: config.trustedProxies ?? [],
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Runs for every way a user can be created, so the sign-up mode holds
          // for social and OIDC sign-in too once they arrive. An instance
          // admin creating a user directly is not signing up.
          before: async (user, ctx) => {
            if (ctx?.path === "/admin/create-user") {
              return;
            }
            if (!(await maySignUp(db, user.email))) {
              throw new APIError("FORBIDDEN", {
                message: "This instance is invite-only. Ask an admin for an invite.",
              });
            }
          },
          after: async (user) => {
            // The first user to sign up becomes the instance admin (see ADR 0014).
            const [row] = await db.select({ n: count() }).from(schema.user);
            if (row?.n === 1) {
              await db
                .update(schema.user)
                .set({ role: "admin" })
                .where(eq(schema.user.id, user.id));
            }
          },
        },
      },
    },
  });
}
