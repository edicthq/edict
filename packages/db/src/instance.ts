import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";

// Who can create a user on the instance: anyone, only people with an invite,
// or also anyone with a verified address at one of signUpDomains. "domain"
// needs email, since an unverified address proves nothing about its domain.
export const signUpMode = pgEnum("sign_up_mode", ["open", "invite_only", "domain"]);

// Settings every replica of an instance must agree on. Exactly one row,
// created on first boot.
export const instanceSettings = pgTable(
  "instance_settings",
  {
    id: integer("id").primaryKey().default(1),
    // Signs sessions when BETTER_AUTH_SECRET is not set.
    authSecret: text("auth_secret").notNull(),
    signUpMode: signUpMode("sign_up_mode").notNull().default("open"),
    // Lowercase domains whose verified addresses may sign up in "domain" mode.
    signUpDomains: text("sign_up_domains").array().notNull().default(sql`'{}'::text[]`),
    // Whether the instance asks GitHub for Edict's latest release each day.
    updateCheck: boolean("update_check").notNull().default(true),
    // What the last successful check found, and when the last check ran.
    // A failed check keeps the release and records its error.
    latestRelease: jsonb("latest_release").$type<{ version: string; url: string; publishedAt: string | null }>(),
    updateCheckedAt: timestamp("update_checked_at", { withTimezone: true }),
    updateCheckError: text("update_check_error"),
    // Opt-in telemetry (ADR 0026): whether the daily ping is on, when the
    // last one went and why it failed if it did.
    telemetry: boolean("telemetry").notNull().default(false),
    telemetrySentAt: timestamp("telemetry_sent_at", { withTimezone: true }),
    telemetryError: text("telemetry_error"),
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
