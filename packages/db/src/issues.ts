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
// The trash (ADR 0019). Set together; rows trashed by one change share its
// id, so restoring brings them back together.
const trashColumns = () => ({
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: uuid("deleted_by"),
  deletedChangeId: uuid("deleted_change_id"),
});

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
    // Makes this a sub-issue. The parent can be in any team.
    parentId: uuid("parent_id"),
    creatorId: uuid("creator_id").notNull(),
    version: version(),
    // The version that last changed each field. A field missing here has not
    // changed since the issue was created, at version 1.
    fieldVersions: jsonb("field_versions").$type<IssueFieldVersions>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ...trashColumns(),
  },
  (table) => [
    unique("issues_org_id_id_unique").on(table.orgId, table.id),
    index("issues_deleted_change_id_idx").on(table.deletedChangeId),
    index("issues_deleted_at_idx").on(table.deletedAt).where(sql`${table.deletedAt} IS NOT NULL`),
    check("issues_trash_together", sql`(${table.deletedAt} IS NULL) = (${table.deletedBy} IS NULL) AND (${table.deletedAt} IS NULL) = (${table.deletedChangeId} IS NULL)`),
    foreignKey({
      name: "issues_deleted_by_fk",
      columns: [table.orgId, table.deletedBy],
      foreignColumns: [members.orgId, members.id],
    }),
    unique("issues_team_id_number_unique").on(table.teamId, table.number),
    index("issues_assignee_id_idx").on(table.assigneeId),
    index("issues_parent_id_idx").on(table.parentId),
    check("issues_not_own_parent", sql`${table.parentId} <> ${table.id}`),
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
      name: "issues_parent_fk",
      columns: [table.orgId, table.parentId],
      foreignColumns: [table.orgId, table.id],
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

// A label for the whole organization (no team) or for one team. One name means
// one label: a team label never shares its name with an organization label,
// so "bug" is never ambiguous for an agent.
export const labels = pgTable(
  "labels",
  {
    id: id(),
    orgId: uuid("org_id").notNull(),
    teamId: uuid("team_id"),
    name: text("name").notNull(),
    // The dot's hue, 0 to 359 (docs/design/tokens.md).
    hue: integer("hue").notNull(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("labels_org_id_id_unique").on(table.orgId, table.id),
    uniqueIndex("labels_org_name_unique")
      .on(table.orgId, sql`lower(${table.name})`)
      .where(sql`${table.teamId} IS NULL`),
    uniqueIndex("labels_team_name_unique")
      .on(table.teamId, sql`lower(${table.name})`)
      .where(sql`${table.teamId} IS NOT NULL`),
    check("labels_hue", sql`${table.hue} BETWEEN 0 AND 359`),
    foreignKey({
      name: "labels_team_fk",
      columns: [table.orgId, table.teamId],
      foreignColumns: [teams.orgId, teams.id],
    }).onDelete("cascade"),
  ],
);

export const issueLabels = pgTable(
  "issue_labels",
  {
    orgId: uuid("org_id").notNull(),
    issueId: uuid("issue_id").notNull(),
    labelId: uuid("label_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.issueId, table.labelId] }),
    index("issue_labels_label_id_idx").on(table.labelId),
    foreignKey({
      name: "issue_labels_issue_fk",
      columns: [table.orgId, table.issueId],
      foreignColumns: [issues.orgId, issues.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "issue_labels_label_fk",
      columns: [table.orgId, table.labelId],
      foreignColumns: [labels.orgId, labels.id],
    }).onDelete("cascade"),
  ],
);

// Stored one way: issue_id blocks, or is a duplicate of, related_issue_id.
// "Blocked by" and "duplicated by" are the same rows read from the other end.
// A related pair is stored with the lower id first, so it exists once.
export const relationType = pgEnum("relation_type", ["blocks", "related", "duplicate_of"]);

export const issueRelations = pgTable(
  "issue_relations",
  {
    id: id(),
    orgId: uuid("org_id").notNull(),
    type: relationType("type").notNull(),
    issueId: uuid("issue_id").notNull(),
    relatedIssueId: uuid("related_issue_id").notNull(),
    creatorId: uuid("creator_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("issue_relations_pair_unique").on(table.issueId, table.relatedIssueId, table.type),
    index("issue_relations_related_issue_id_idx").on(table.relatedIssueId),
    check("issue_relations_not_self", sql`${table.issueId} <> ${table.relatedIssueId}`),
    check("issue_relations_related_ordered", sql`${table.type} <> 'related' OR ${table.issueId} < ${table.relatedIssueId}`),
    foreignKey({
      name: "issue_relations_issue_fk",
      columns: [table.orgId, table.issueId],
      foreignColumns: [issues.orgId, issues.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "issue_relations_related_issue_fk",
      columns: [table.orgId, table.relatedIssueId],
      foreignColumns: [issues.orgId, issues.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "issue_relations_creator_fk",
      columns: [table.orgId, table.creatorId],
      foreignColumns: [members.orgId, members.id],
    }),
  ],
);

// A markdown comment on an issue (ADR 0009). Compares the whole version
// (ADR 0018): it is small, and two people rarely edit one at once.
export const comments = pgTable(
  "comments",
  {
    id: id(),
    orgId: uuid("org_id").notNull(),
    issueId: uuid("issue_id").notNull(),
    // Markdown (ADR 0009).
    body: text("body").notNull(),
    creatorId: uuid("creator_id").notNull(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ...trashColumns(),
  },
  (table) => [
    index("comments_issue_id_idx").on(table.issueId),
    index("comments_deleted_at_idx").on(table.deletedAt).where(sql`${table.deletedAt} IS NOT NULL`),
    check("comments_trash_together", sql`(${table.deletedAt} IS NULL) = (${table.deletedBy} IS NULL) AND (${table.deletedAt} IS NULL) = (${table.deletedChangeId} IS NULL)`),
    foreignKey({
      name: "comments_deleted_by_fk",
      columns: [table.orgId, table.deletedBy],
      foreignColumns: [members.orgId, members.id],
    }),
    check("comments_body_not_empty", sql`${table.body} <> ''`),
    foreignKey({
      name: "comments_issue_fk",
      columns: [table.orgId, table.issueId],
      foreignColumns: [issues.orgId, issues.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "comments_creator_fk",
      columns: [table.orgId, table.creatorId],
      foreignColumns: [members.orgId, members.id],
    }),
  ],
);

// A file attached to an issue (ADR 0020). The bytes live in storage under
// `${orgId}/${id}`; this row is what the data-access layer guards, so the
// visibility of the issue decides who sees the file. Attachment rows are
// immutable: deletions wait for the trash (M2d).
export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    orgId: uuid("org_id").notNull(),
    issueId: uuid("issue_id").notNull(),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    // sha-256, hex.
    checksum: text("checksum").notNull(),
    creatorId: uuid("creator_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("attachments_issue_id_idx").on(table.issueId),
    check("attachments_size_positive", sql`${table.sizeBytes} > 0`),
    foreignKey({
      name: "attachments_issue_fk",
      columns: [table.orgId, table.issueId],
      foreignColumns: [issues.orgId, issues.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "attachments_creator_fk",
      columns: [table.orgId, table.creatorId],
      foreignColumns: [members.orgId, members.id],
    }),
  ],
);
