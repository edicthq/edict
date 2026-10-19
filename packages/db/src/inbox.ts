import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { events } from "./events.js";
import { comments, issues } from "./issues.js";
import { members, organizations } from "./tenancy.js";
import { webhooks } from "./webhooks.js";

// ADR 0005. Notifications about work involving a member, each made from one
// event in the same transaction (server: api/inbox.ts): assignments,
// delegations, status changes, comments, mentions, agents' progress, and a
// webhook that turned itself off.
export const inbox = pgTable(
  "inbox",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    orgId: uuid("org_id").notNull(),
    recipientId: uuid("recipient_id").notNull(),
    actorId: uuid("actor_id"),
    // The event this item was made from. Null for items older than that rule.
    eventId: uuid("event_id"),
    // What the item is about: an issue, or for webhook_disabled a webhook.
    issueId: uuid("issue_id"),
    webhookId: uuid("webhook_id"),
    commentId: uuid("comment_id"),
    // InboxItemType in packages/schema.
    type: text("type").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index("inbox_org_recipient_read_idx").on(table.orgId, table.recipientId, table.readAt),
    index("inbox_org_recipient_created_idx").on(table.orgId, table.recipientId, table.createdAt),
    index("inbox_issue_idx").on(table.issueId),
    check("inbox_has_subject", sql`${table.issueId} IS NOT NULL OR ${table.webhookId} IS NOT NULL`),
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
      name: "inbox_event_fk",
      columns: [table.eventId],
      foreignColumns: [events.id],
    }),
    foreignKey({
      name: "inbox_webhook_fk",
      columns: [table.webhookId],
      foreignColumns: [webhooks.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "inbox_comment_fk",
      columns: [table.commentId],
      foreignColumns: [comments.id],
    }).onDelete("cascade"),
  ],
);
