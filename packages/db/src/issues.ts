import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { members, teams } from "./tenancy.js";

// Like tenancy.ts: every table carries org_id under row-level security, and
// references to other org-owned rows use composite keys that include it.

const id = () => uuid("id").primaryKey().default(sql`uuidv7()`);
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`);
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`);
// ADR 0018: goes up by one on every change.
const version = () => integer("version").notNull().default(1);

// The five fixed meanings every status maps to, in workflow order. Sorting by
// the enum sorts by that order.
export const statusCategory = pgEnum("status_category", ["backlog", "todo", "in_progress", "done", "canceled"]);

// Declared from most to least pressing, so sorting by priority puts urgent
// first and none last.
export const priority = pgEnum("priority", ["urgent", "high", "medium", "low", "none"]);

export const statuses = pgTable(
  "statuses",
  {
    id: id(),
    orgId: uuid("org_id").notNull(),
    teamId: uuid("team_id").notNull(),
    name: text("name").notNull(),
    category: statusCategory("category").notNull(),
    // Order within the category.
    position: integer("position").notNull(),
    // The status new issues start in. Exactly one per team.
    isDefault: boolean("is_default").notNull().default(false),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("statuses_org_id_team_id_id_unique").on(table.orgId, table.teamId, table.id),
    uniqueIndex("statuses_team_id_name_unique").on(table.teamId, sql`lower(${table.name})`),
    uniqueIndex("statuses_team_id_default_unique").on(table.teamId).where(sql`${table.isDefault}`),
    foreignKey({
      name: "statuses_team_fk",
      columns: [table.orgId, table.teamId],
      foreignColumns: [teams.orgId, teams.id],
    }).onDelete("cascade"),
  ],
);

// Fields of an issue that per-field versions track (ADR 0018), named as the
// API names them.
export type IssueFieldVersions = Partial<Record<string, number>>;

export const issues = pgTable(
  "issues",
  {
    id: id(),
    orgId: uuid("org_id").notNull(),
    teamId: uuid("team_id").notNull(),
    // Unique within the team. With the team's key it makes the identifier.
    number: integer("number").notNull(),
    title: text("title").notNull(),
    // Markdown (ADR 0009).
    description: text("description").notNull().default(""),
    statusId: uuid("status_id").notNull(),
    priority: priority("priority").notNull().default("none"),
    estimate: integer("estimate"),
    assigneeId: uuid("assignee_id"),
    creatorId: uuid("creator_id").notNull(),
    version: version(),
    // The version that last changed each field. A field missing here has not
    // changed since the issue was created, at version 1.
    fieldVersions: jsonb("field_versions").$type<IssueFieldVersions>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("issues_org_id_id_unique").on(table.orgId, table.id),
    unique("issues_team_id_number_unique").on(table.teamId, table.number),
    index("issues_assignee_id_idx").on(table.assigneeId),
    check("issues_estimate_not_negative", sql`${table.estimate} >= 0`),
    foreignKey({
      name: "issues_team_fk",
      columns: [table.orgId, table.teamId],
      foreignColumns: [teams.orgId, teams.id],
    }).onDelete("cascade"),
    // The status must belong to the issue's own team.
    foreignKey({
      name: "issues_status_fk",
      columns: [table.orgId, table.teamId, table.statusId],
      foreignColumns: [statuses.orgId, statuses.teamId, statuses.id],
    }),
    foreignKey({
      name: "issues_assignee_fk",
      columns: [table.orgId, table.assigneeId],
      foreignColumns: [members.orgId, members.id],
    }),
    foreignKey({
      name: "issues_creator_fk",
      columns: [table.orgId, table.creatorId],
      foreignColumns: [members.orgId, members.id],
    }),
  ],
);

// Every team and number an issue has held, so its old identifiers keep
// resolving after it moves (ADR 0017). Rows outlive the issue: a purged issue's
// numbers stay taken.
export const issueNumbers = pgTable(
  "issue_numbers",
  {
    orgId: uuid("org_id").notNull(),
    teamId: uuid("team_id").notNull(),
    number: integer("number").notNull(),
    issueId: uuid("issue_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.number] }),
    index("issue_numbers_issue_id_idx").on(table.issueId),
    foreignKey({
      name: "issue_numbers_team_fk",
      columns: [table.orgId, table.teamId],
      foreignColumns: [teams.orgId, teams.id],
    }).onDelete("cascade"),
  ],
);
