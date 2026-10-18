import { sql } from "drizzle-orm";
import { foreignKey, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { events } from "./events.js";
import { members, organizations } from "./tenancy.js";

// ADR 0022. Like tenancy.ts: org_id on every row under row-level security,
// and composite keys for references.

export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    orgId: uuid("org_id").notNull(),
    // An agent's webhook also receives events about issues delegated to it.
    // Null for an organization's webhook.
    agentId: uuid("agent_id"),
    url: text("url").notNull(),
    // Signs deliveries, so Edict reads it back. Shown in full only when the
    // webhook is created or its secret rotated.
    secret: text("secret").notNull(),
    // Event types to send. Empty sends every type.
    eventTypes: text("event_types").array().notNull().default(sql`'{}'::text[]`),
    // Set when deliveries ran out of retries, or the agent was paused.
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    disabledReason: text("disabled_reason"),
    createdBy: uuid("created_by").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index("webhooks_org_id_idx").on(table.orgId),
    index("webhooks_agent_id_idx").on(table.agentId),
    foreignKey({ name: "webhooks_org_fk", columns: [table.orgId], foreignColumns: [organizations.id] }).onDelete("cascade"),
    foreignKey({
      name: "webhooks_agent_fk",
      columns: [table.orgId, table.agentId],
      foreignColumns: [members.orgId, members.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "webhooks_created_by_fk",
      columns: [table.orgId, table.createdBy],
      foreignColumns: [members.orgId, members.id],
    }),
  ],
);

// Events waiting for the dispatcher, written by emit in the event's own
// transaction when the organization has an active webhook.
export const webhookOutbox = pgTable(
  "webhook_outbox",
  {
    eventId: uuid("event_id").primaryKey(),
    orgId: uuid("org_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index("webhook_outbox_org_id_idx").on(table.orgId),
    foreignKey({ name: "webhook_outbox_event_fk", columns: [table.eventId], foreignColumns: [events.id] }).onDelete("cascade"),
  ],
);

export const deliveryStatus = pgEnum("delivery_status", ["pending", "delivered", "failed"]);

// One event sent, or to be sent, to one webhook, with its last attempt.
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    orgId: uuid("org_id").notNull(),
    webhookId: uuid("webhook_id").notNull(),
    eventId: uuid("event_id").notNull(),
    // The delivery this one sends again, from the redeliver button.
    redeliveryOf: uuid("redelivery_of"),
    status: deliveryStatus("status").notNull().default("pending"),
    // The JSON body, fixed when the delivery is made, so retries and
    // redeliveries send the same payload.
    requestBody: text("request_body").notNull(),
    attempts: integer("attempts").notNull().default(0),
    responseStatus: integer("response_status"),
    // The first 2 KB of the last response, or why it failed to arrive.
    responseBody: text("response_body"),
    durationMs: integer("duration_ms"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index("webhook_deliveries_webhook_id_id_idx").on(table.webhookId, table.id),
    index("webhook_deliveries_created_at_idx").on(table.createdAt),
    uniqueIndex("webhook_deliveries_once_unique")
      .on(table.webhookId, table.eventId)
      .where(sql`${table.redeliveryOf} IS NULL`),
    foreignKey({
      name: "webhook_deliveries_webhook_fk",
      columns: [table.webhookId],
      foreignColumns: [webhooks.id],
    }).onDelete("cascade"),
  ],
);
