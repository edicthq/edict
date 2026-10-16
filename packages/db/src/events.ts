import { sql } from "drizzle-orm";
import { foreignKey, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { members, organizations } from "./tenancy.js";

// ADR 0005. Append-only: the application role can insert and read events, never
// change them. Written in the same transaction as the change (emit in scope.ts).
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    orgId: uuid("org_id").notNull(),
    // Dotted subject and verb, e.g. "team.created".
    type: text("type").notNull(),
    actorId: uuid("actor_id").notNull(),
    // The human whose OAuth approval let an agent act. Null for humans and for
    // agents using an API key.
    onBehalfOfId: uuid("on_behalf_of_id"),
    subjectId: uuid("subject_id").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index("events_org_id_id_idx").on(table.orgId, table.id),
    index("events_subject_id_idx").on(table.subjectId),
    foreignKey({
      name: "events_org_fk",
      columns: [table.orgId],
      foreignColumns: [organizations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "events_actor_fk",
      columns: [table.orgId, table.actorId],
      foreignColumns: [members.orgId, members.id],
    }),
    foreignKey({
      name: "events_on_behalf_of_fk",
      columns: [table.orgId, table.onBehalfOfId],
      foreignColumns: [members.orgId, members.id],
    }),
  ],
);
