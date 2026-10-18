import { sql } from "drizzle-orm";
import { foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { members, organizations } from "./tenancy.js";
import { teams } from "./tenancy.js";

// ADR 0023. A saved view holds exactly the team page's URL view — the
// question, filter sets, grouping and sort — validated by the API schema but
// not interpreted by the server. Only its owner sees it.

export const savedViews = pgTable(
  "saved_views",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    orgId: uuid("org_id").notNull(),
    teamId: uuid("team_id").notNull(),
    memberId: uuid("member_id").notNull(),
    name: text("name").notNull(),
    query: jsonb("query").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    uniqueIndex("saved_views_owner_name_unique").on(table.teamId, table.memberId, table.name),
    foreignKey({ name: "saved_views_org_fk", columns: [table.orgId], foreignColumns: [organizations.id] }).onDelete("cascade"),
    foreignKey({
      name: "saved_views_team_fk",
      columns: [table.orgId, table.teamId],
      foreignColumns: [teams.orgId, teams.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "saved_views_member_fk",
      columns: [table.orgId, table.memberId],
      foreignColumns: [members.orgId, members.id],
    }).onDelete("cascade"),
  ],
);
