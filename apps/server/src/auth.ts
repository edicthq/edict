import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { count, eq } from "drizzle-orm";
import { schema, type Database } from "@edicthq/db";

export interface AuthConfig {
  secret: string;
  baseURL?: string;
}

export type EdictAuth = ReturnType<typeof createAuth>;

export function createAuth(config: AuthConfig, db: Database) {
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [admin()],
    databaseHooks: {
      user: {
        create: {
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
