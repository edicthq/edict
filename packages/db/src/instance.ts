import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";

// Who can create a user on the instance. "domain" arrives with email
// verification, since an unverified address proves nothing about its domain.
export const signUpMode = pgEnum("sign_up_mode", ["open", "invite_only"]);

// Settings every replica of an instance must agree on. Exactly one row,
// created on first boot.
export const instanceSettings = pgTable(
  "instance_settings",
  {
    id: integer("id").primaryKey().default(1),
    // Signs sessions when BETTER_AUTH_SECRET is not set.
    authSecret: text("auth_secret").notNull(),
    signUpMode: signUpMode("sign_up_mode").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [check("instance_settings_single_row", sql`${table.id} = 1`)],
);

// The event log for changes outside any organization (ADR 0005), made by an
// instance admin. Organization events live in events.
export const instanceEvents = pgTable("instance_events", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  type: text("type").notNull(),
  // Null once the user is deleted. The event stays.
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});
