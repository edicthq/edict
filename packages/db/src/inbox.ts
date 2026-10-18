import { sql } from "drizzle-orm";
import { foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { comments, issues } from "./issues.js";
import { members, organizations } from "./tenancy.js";

// ADR 0005. Inbox notifications for work involving a member (assignments,
// delegations, status changes, comments, mentions).
export const inbox = pgTable(
  "inbox",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    orgId: uuid("org_id").notNull(),
    recipientId: uuid("recipient_id").notNull(),
    actorId: uuid("actor_id"),
    issueId: uuid("issue_id").notNull(),
    commentId: uuid("comment_id"),
    type: text("type").notNull(), // assigned, delegated, status_changed, comment_created, mentioned
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index("inbox_org_recipient_read_idx").on(table.orgId, table.recipientId, table.readAt),
    index("inbox_org_recipient_created_idx").on(table.orgId, table.recipientId, table.createdAt),
    index("inbox_issue_idx").on(table.issueId),
    foreignKey({
      name: "inbox_org_fk",
      columns: [table.orgId],
      foreignColumns: [organizations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "inbox_recipient_fk",
      columns: [table.orgId, table.recipientId],
      foreignColumns: [members.orgId, members.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "inbox_actor_fk",
      columns: [table.orgId, table.actorId],
      foreignColumns: [members.orgId, members.id],
    }).onDelete("set null"),
    foreignKey({
      name: "inbox_issue_fk",
      columns: [table.orgId, table.issueId],
      foreignColumns: [issues.orgId, issues.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "inbox_comment_fk",
      columns: [table.commentId],
      foreignColumns: [comments.id],
    }).onDelete("cascade"),
  ],
);
