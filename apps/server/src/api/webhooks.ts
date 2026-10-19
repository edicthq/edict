import { randomBytes } from "node:crypto";
import { createRoute, z } from "@hono/zod-openapi";
import { and, desc, eq, sql } from "drizzle-orm";
import { emit, events, members, webhookDeliveries, webhooks, type Transaction } from "@edicthq/db";
import { CreatedWebhook, CreateWebhook, Id, UpdateWebhook, Webhook, WebhookDelivery } from "@edicthq/schema";
import { requireEveryTeam, requireRole } from "./access.js";
import type { Caller } from "./callers.js";
import { body, errors, inOrg, json, noContent, OrgParams, router, type ApiDeps } from "./context.js";
import { changesOf, invalid, notFound, requireVersion } from "./errors.js";
import { checkWebhookUrl, PrivateTargetError } from "../outbound.js";

type WebhookRow = typeof webhooks.$inferSelect;
type DeliveryRow = typeof webhookDeliveries.$inferSelect;

function toWebhook(row: WebhookRow): Webhook {
  return {
    id: row.id,
    url: row.url,
    agentId: row.agentId,
    eventTypes: row.eventTypes,
    disabledAt: row.disabledAt?.toISOString() ?? null,
    disabledReason: row.disabledReason,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDelivery(row: DeliveryRow, eventType: string): WebhookDelivery {
  return {
    id: row.id,
    webhookId: row.webhookId,
    eventId: row.eventId,
    eventType,
    redeliveryOf: row.redeliveryOf,
    status: row.status,
    requestBody: row.requestBody,
    attempts: row.attempts,
    responseStatus: row.responseStatus,
    responseBody: row.responseBody,
    durationMs: row.durationMs,
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const newSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

const WebhookParams = OrgParams.extend({ webhookId: Id });
const tags = ["Webhooks"];

const listWebhooks = createRoute({
  method: "get",
  path: "/organizations/{orgId}/webhooks",
  tags,
  summary: "The organization's webhooks",
  request: { params: OrgParams },
  responses: { 200: json(z.array(Webhook), "Webhooks, oldest first"), ...errors("unauthorized", "forbidden", "not_found") },
});

const getWebhook = createRoute({
  method: "get",
  path: "/organizations/{orgId}/webhooks/{webhookId}",
  tags,
  summary: "One webhook",
  request: { params: WebhookParams },
  responses: { 200: json(Webhook, "The webhook"), ...errors("unauthorized", "forbidden", "not_found") },
});

const createWebhook = createRoute({
  method: "post",
  path: "/organizations/{orgId}/webhooks",
  tags,
  summary: "Send events to a URL",
  description:
    "Each delivery is a signed POST: Edict-Signature is t=<unix seconds>,v1=<hex HMAC-SHA256 of \"<t>.<body>\"> with the secret. Deliveries arrive at least once; deduplicate on the payload's id. An agent's webhook gets what happens to issues delegated to the agent, which is how agent runners wake up.",
  request: { params: OrgParams, ...body(CreateWebhook) },
  responses: { 201: json(CreatedWebhook, "The webhook and its secret"), ...errors("invalid_request", "unauthorized", "forbidden", "not_found") },
});

const updateWebhook = createRoute({
  method: "patch",
  path: "/organizations/{orgId}/webhooks/{webhookId}",
  tags,
  summary: "Change a webhook's URL or event types, or turn it back on",
  request: { params: WebhookParams, ...body(UpdateWebhook) },
  responses: { 200: json(Webhook, "The webhook"), ...errors("invalid_request", "unauthorized", "forbidden", "not_found", "conflict") },
});

const deleteWebhook = createRoute({
  method: "delete",
  path: "/organizations/{orgId}/webhooks/{webhookId}",
  tags,
  summary: "Delete a webhook and its delivery log",
  request: { params: WebhookParams },
  responses: { ...noContent, ...errors("unauthorized", "forbidden", "not_found") },
});

const rotateSecret = createRoute({
  method: "post",
  path: "/organizations/{orgId}/webhooks/{webhookId}/rotate-secret",
  tags,
  summary: "Give a webhook a new secret",
  request: { params: WebhookParams },
  responses: { 200: json(CreatedWebhook, "The webhook and its new secret"), ...errors("unauthorized", "forbidden", "not_found") },
});

const listDeliveries = createRoute({
  method: "get",
  path: "/organizations/{orgId}/webhooks/{webhookId}/deliveries",
  tags,
  summary: "A webhook's delivery log, newest first",
  description: "Kept for 30 days.",
  request: { params: WebhookParams, query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }) },
  responses: { 200: json(z.array(WebhookDelivery), "Deliveries"), ...errors("unauthorized", "forbidden", "not_found") },
});

const redeliver = createRoute({
  method: "post",
  path: "/organizations/{orgId}/webhooks/{webhookId}/deliveries/{deliveryId}/redeliver",
  tags,
  summary: "Send a delivery's payload again",
  request: { params: WebhookParams.extend({ deliveryId: Id }) },
  responses: { 201: json(WebhookDelivery, "The new delivery"), ...errors("unauthorized", "forbidden", "not_found") },
});

async function webhookRow(tx: Transaction, webhookId: string, forUpdate = false): Promise<WebhookRow> {
  const query = tx.select().from(webhooks).where(eq(webhooks.id, webhookId));
  const [row] = forUpdate ? await query.for("update") : await query;
  if (!row) throw notFound("webhook");
  return row;
}

function requireAdmin(caller: Caller, action: string) {
  requireRole(caller, "admin", action, "settings");
}

export interface WebhookDeps extends ApiDeps {
  // Queues a delivery made outside the dispatcher, like a redelivery.
  queueDelivery?: (job: { orgId: string; deliveryId: string }) => Promise<void>;
  // Lets webhook URLs name private addresses (outbound.ts). Off by default.
  privateWebhookTargets?: boolean;
}

// Refuses a URL on the instance's own network before it is saved.
async function checkUrl(deps: WebhookDeps, url: string): Promise<void> {
  try {
    await checkWebhookUrl(url, { allowPrivate: deps.privateWebhookTargets ?? false });
  } catch (error) {
    if (error instanceof PrivateTargetError) throw invalid(error.message);
    throw error;
  }
}

export function webhookRoutes(deps: WebhookDeps) {
  const app = router();

  app.openapi(listWebhooks, async (c) => {
    const { orgId } = c.req.valid("param");
    const rows = await inOrg(deps, c, orgId, (tx, caller) => {
      requireAdmin(caller, "see webhooks");
      return tx.select().from(webhooks).orderBy(webhooks.id);
    });
    return c.json(rows.map(toWebhook), 200);
  });

  app.openapi(getWebhook, async (c) => {
    const { orgId, webhookId } = c.req.valid("param");
    const row = await inOrg(deps, c, orgId, (tx, caller) => {
      requireAdmin(caller, "see webhooks");
      return webhookRow(tx, webhookId);
    });
    return c.json(toWebhook(row), 200);
  });

  app.openapi(createWebhook, async (c) => {
    const { orgId } = c.req.valid("param");
    const input = c.req.valid("json");
    const secret = newSecret();
    const row = await inOrg(deps, c, orgId, async (tx, caller) => {
      requireAdmin(caller, "create webhooks");
      // An organization webhook receives every event, whatever team it is in.
      if (!input.agentId) requireEveryTeam(caller, "create organization webhooks");
      await checkUrl(deps, input.url);
      if (input.agentId) {
        const [agent] = await tx.select().from(members).where(and(eq(members.id, input.agentId), eq(members.kind, "agent")));
        if (!agent || agent.removedAt) throw invalid("agentId is not an agent in this organization.");
        if (agent.connectedBy) throw invalid("A connected agent picks up work when its person asks; give webhooks to agents an admin created.");
      }
      const [created] = await tx
        .insert(webhooks)
        .values({ orgId, agentId: input.agentId, url: input.url, secret, eventTypes: [...new Set(input.eventTypes)].sort(), createdBy: caller.id })
        .returning();
      await emit(tx, orgId, {
        type: "webhook.created",
        actorId: caller.id,
        subjectId: created!.id,
        data: { url: input.url, agentId: input.agentId, eventTypes: created!.eventTypes },
      });
      return created!;
    });
    return c.json({ webhook: toWebhook(row), secret }, 201);
  });

  app.openapi(updateWebhook, async (c) => {
    const { orgId, webhookId } = c.req.valid("param");
    const { version, enabled, ...input } = c.req.valid("json");
    const row = await inOrg(deps, c, orgId, async (tx, caller) => {
      requireAdmin(caller, "change webhooks");
      if (input.url) await checkUrl(deps, input.url);
      const current = await webhookRow(tx, webhookId, true);
      requireVersion(current.version, version, "webhook");
      const next = { ...input, eventTypes: input.eventTypes ? [...new Set(input.eventTypes)].sort() : undefined };
      const changes: Record<string, unknown> = changesOf(current, next);
      const turnOn = enabled === true && current.disabledAt !== null;
      const turnOff = enabled === false && current.disabledAt === null;
      if (turnOn) changes.enabled = { from: false, to: true };
      if (turnOff) changes.enabled = { from: true, to: false };
      if (Object.keys(changes).length === 0) return current;
      const [updated] = await tx
        .update(webhooks)
        .set({
          ...next,
          ...(turnOn ? { disabledAt: null, disabledReason: null } : {}),
          ...(turnOff ? { disabledAt: new Date(), disabledReason: "Turned off by an admin." } : {}),
          version: sql`${webhooks.version} + 1`,
        })
        .where(eq(webhooks.id, webhookId))
        .returning();
      await emit(tx, orgId, { type: "webhook.updated", actorId: caller.id, subjectId: webhookId, data: { changes, version: updated!.version } });
      return updated!;
    });
    return c.json(toWebhook(row), 200);
  });

  app.openapi(deleteWebhook, async (c) => {
    const { orgId, webhookId } = c.req.valid("param");
    await inOrg(deps, c, orgId, async (tx, caller) => {
      requireAdmin(caller, "delete webhooks");
      const row = await webhookRow(tx, webhookId, true);
      await tx.delete(webhooks).where(eq(webhooks.id, webhookId));
      await emit(tx, orgId, { type: "webhook.deleted", actorId: caller.id, subjectId: webhookId, data: { url: row.url, agentId: row.agentId } });
    });
    return c.body(null, 204);
  });

  app.openapi(rotateSecret, async (c) => {
    const { orgId, webhookId } = c.req.valid("param");
    const secret = newSecret();
    const row = await inOrg(deps, c, orgId, async (tx, caller) => {
      requireAdmin(caller, "rotate webhook secrets");
      await webhookRow(tx, webhookId, true);
      const [updated] = await tx
        .update(webhooks)
        .set({ secret, version: sql`${webhooks.version} + 1` })
        .where(eq(webhooks.id, webhookId))
        .returning();
      await emit(tx, orgId, { type: "webhook.secret_rotated", actorId: caller.id, subjectId: webhookId, data: { version: updated!.version } });
      return updated!;
    });
    return c.json({ webhook: toWebhook(row), secret }, 200);
  });

  app.openapi(listDeliveries, async (c) => {
    const { orgId, webhookId } = c.req.valid("param");
    const { limit } = c.req.valid("query");
    const rows = await inOrg(deps, c, orgId, async (tx, caller) => {
      requireAdmin(caller, "see webhook deliveries");
      await webhookRow(tx, webhookId);
      return tx
        .select({ delivery: webhookDeliveries, eventType: events.type })
        .from(webhookDeliveries)
        .innerJoin(events, eq(events.id, webhookDeliveries.eventId))
        .where(eq(webhookDeliveries.webhookId, webhookId))
        .orderBy(desc(webhookDeliveries.id))
        .limit(limit);
    });
    return c.json(rows.map((row) => toDelivery(row.delivery, row.eventType)), 200);
  });

  app.openapi(redeliver, async (c) => {
    const { orgId, webhookId, deliveryId } = c.req.valid("param");
    const created = await inOrg(deps, c, orgId, async (tx, caller) => {
      requireAdmin(caller, "redeliver webhooks");
      await webhookRow(tx, webhookId);
      const [original] = await tx
        .select({ delivery: webhookDeliveries, eventType: events.type })
        .from(webhookDeliveries)
        .innerJoin(events, eq(events.id, webhookDeliveries.eventId))
        .where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.webhookId, webhookId)));
      if (!original) throw notFound("delivery");
      const [row] = await tx
        .insert(webhookDeliveries)
        .values({
          orgId,
          webhookId,
          eventId: original.delivery.eventId,
          redeliveryOf: original.delivery.redeliveryOf ?? original.delivery.id,
          requestBody: original.delivery.requestBody,
        })
        .returning();
      return toDelivery(row!, original.eventType);
    });
    await deps.queueDelivery?.({ orgId, deliveryId: created.id });
    return c.json(created, 201);
  });

  return app;
}

// Pausing an agent stops its webhooks (ADR 0021).
export async function disableAgentWebhooks(tx: Transaction, agentId: string): Promise<number> {
  const rows = await tx
    .update(webhooks)
    .set({ disabledAt: new Date(), disabledReason: "The agent was paused.", version: sql`${webhooks.version} + 1` })
    .where(and(eq(webhooks.agentId, agentId), sql`${webhooks.disabledAt} IS NULL`))
    .returning({ id: webhooks.id });
  return rows.length;
}
