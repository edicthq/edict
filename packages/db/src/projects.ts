import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { members, organizations } from "./tenancy.js";

const id = () => uuid("id").primaryKey().default(sql`uuidv7()`);
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`);
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`);
const version = () => integer("version").notNull().default(1);
const trashColumns = () => ({
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: uuid("deleted_by"),
  deletedChangeId: uuid("deleted_change_id"),
});

export const projectStatus = pgEnum("project_status", [
  "planned",
  "in_progress",
  "paused",
  "completed",
  "canceled",
]);

// A goal with a lead, target date and status that groups issues from any team
// (GLOSSARY.md, ADR 0002).
export const projects = pgTable(
  "projects",
  {
    id: id(),
    orgId: uuid("org_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    status: projectStatus("status").notNull().default("planned"),
    leadId: uuid("lead_id"),
    startDate: timestamp("start_date", { withTimezone: true }),
    targetDate: timestamp("target_date", { withTimezone: true }),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ...trashColumns(),
  },
  (table) => [
    unique("projects_org_id_id_unique").on(table.orgId, table.id),
    uniqueIndex("projects_org_id_slug_unique").on(table.orgId, sql`lower(${table.slug})`),
    index("projects_lead_id_idx").on(table.leadId),
    index("projects_deleted_change_id_idx").on(table.deletedChangeId),
    index("projects_deleted_at_idx").on(table.deletedAt).where(sql`${table.deletedAt} IS NOT NULL`),
    check(
      "projects_trash_together",
      sql`(${table.deletedAt} IS NULL) = (${table.deletedBy} IS NULL) AND (${table.deletedAt} IS NULL) = (${table.deletedChangeId} IS NULL)`,
    ),
    foreignKey({
      name: "projects_org_fk",
      columns: [table.orgId],
      foreignColumns: [organizations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "projects_lead_fk",
      columns: [table.orgId, table.leadId],
      foreignColumns: [members.orgId, members.id],
    }).onDelete("set null"),
    foreignKey({
      name: "projects_deleted_by_fk",
      columns: [table.orgId, table.deletedBy],
      foreignColumns: [members.orgId, members.id],
    }),
  ],
);
