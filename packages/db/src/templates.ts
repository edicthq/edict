import { sql } from "drizzle-orm";
import { foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations, teams } from "./tenancy.js";

// ADR 0009 and the plan: a team's prefilled starting point for a new issue.
// Templates hold a markdown description and the labels to start with; anyone
// who can see the team reads them.
export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    orgId: uuid("org_id").notNull(),
    teamId: uuid("team_id").notNull(),
    name: text("name").notNull(),
    title: text("title").default("").notNull(),
    description: text("description").default("").notNull(),
    labelIds: jsonb("label_ids").$type<string[]>().default([]).notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    uniqueIndex("templates_team_name_unique").on(table.teamId, table.name),
    index("templates_org_idx").on(table.orgId),
    foreignKey({ name: "templates_org_fk", columns: [table.orgId], foreignColumns: [organizations.id] }).onDelete("cascade"),
    foreignKey({
      name: "templates_team_fk",
      columns: [table.orgId, table.teamId],
      foreignColumns: [teams.orgId, teams.id],
    }).onDelete("cascade"),
  ],
);
