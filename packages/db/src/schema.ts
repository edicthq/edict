import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export * from "./auth-schema.js";
export * from "./tenancy.js";
export * from "./events.js";

// Settings every replica of an instance must agree on. Exactly one row.
export const instanceSettings = pgTable(
  "instance_settings",
  {
    id: integer("id").primaryKey().default(1),
    // Signs sessions when BETTER_AUTH_SECRET is not set.
    authSecret: text("auth_secret").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [check("instance_settings_single_row", sql`${table.id} = 1`)],
);
