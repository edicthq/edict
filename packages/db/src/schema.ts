import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export * from "./auth-schema.js";

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

// The tenant root. Tables owned by an organization carry org_id and rely on
// row-level security; that enforcement arrives with its own migration.
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});
