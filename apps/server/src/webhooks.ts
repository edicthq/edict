// Webhook delivery (ADR 0022). emit queues an event in webhook_outbox when the
// organization has an active webhook. The dispatcher turns each queued event
// into one delivery per webhook it goes to and a pg-boss job per delivery.
// The job sends it, signed, and pg-boss retries it with backoff.
import { createHmac } from "node:crypto";
import { sendWebhook } from "./outbound.js";
import type { PgBoss } from "pg-boss";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  emit,
  events,
  inScope,
  issues,
  members,
  user,
  webhookDeliveries,
  webhookOutbox,
  webhooks,
  type Database,
  type Transaction,
} from "@edicthq/db";

export const DELIVERY_QUEUE = "webhook-delivery";

export interface WebhookRetry {
  // Retries after the first attempt.
  limit: number;
  // The first retry's delay. Each next one doubles, up to four hours.
  delaySeconds: number;
}

// 30 s, 1 min, 2 min ... then every 4 hours: about 24 hours in all.
export const DEFAULT_WEBHOOK_RETRY: WebhookRetry = { limit: 14, delaySeconds: 30 };

export interface DeliveryOptions {
  retry: WebhookRetry;
  // Whether deliveries may go to private addresses (outbound.ts).
  allowPrivate: boolean;
}

export interface DeliveryJob {
  orgId: string;
  deliveryId: string;
}

type EventRow = typeof events.$inferSelect;
type WebhookRow = typeof webhooks.$inferSelect;

// The issue an event is about, if any: its subject for issue events, else the
// issueId its data names.
function issueOf(event: EventRow): string | undefined {
  if (event.type.startsWith("issue.")) return event.subjectId;
  const issueId = (event.data as { issueId?: unknown }).issueId;
  return typeof issueId === "string" ? issueId : undefined;
}

// Which webhooks an event goes to. An organization's webhook gets the types
// it subscribes to, or every type. An agent's webhook gets what happens to
// issues delegated to the agent now, and events about the agent itself of the
// types it subscribes to; nothing else, so it never sees more than the agent.
async function targets(tx: Transaction, event: EventRow, active: WebhookRow[]): Promise<WebhookRow[]> {
  const issueId = issueOf(event);
  let delegateId: string | null = null;
  if (issueId && active.some((hook) => hook.agentId)) {
    const [issue] = await tx.select({ delegateId: issues.delegateId }).from(issues).where(eq(issues.id, issueId));
    delegateId = issue?.delegateId ?? null;
  }
  const subscribed = (hook: WebhookRow) => hook.eventTypes.length === 0 || hook.eventTypes.includes(event.type);
  return active.filter((hook) =>
    hook.agentId === null
      ? subscribed(hook)
      : hook.agentId === delegateId || (event.subjectId === hook.agentId && subscribed(hook)),
  );
}

// The JSON an event is delivered as. The realtime hub sends the same shape
// over /ws.
export async function eventPayload(tx: Transaction, event: EventRow): Promise<string> {
  const people = await tx
    .select({ id: members.id, kind: members.kind, agentName: members.name, userName: user.name })
    .from(members)
    .leftJoin(user, eq(user.id, members.userId))
    .where(inArray(members.id, [event.actorId, ...(event.onBehalfOfId ? [event.onBehalfOfId] : [])]));
  const who = (id: string | null) => {
    const row = people.find((p) => p.id === id);
    return row ? { id: row.id, kind: row.kind, name: (row.kind === "agent" ? row.agentName : row.userName) ?? "Former member" } : null;
  };
  return JSON.stringify({
    id: event.id,
    type: event.type,
    createdAt: event.createdAt.toISOString(),
    organizationId: event.orgId,
    changeId: event.changeId,
    actor: who(event.actorId),
    onBehalfOf: who(event.onBehalfOfId),
    subjectId: event.subjectId,
    data: event.data,
  });
}

// Turns queued events into deliveries, one organization at a time, and
// returns the jobs to queue. Rows taken here are skipped by other replicas.
export async function dispatch(db: Database, queue: (jobs: DeliveryJob[]) => Promise<void>): Promise<number> {
  const { rows: orgs } = await db.execute<{ org_id: string }>(sql`SELECT DISTINCT org_id FROM webhook_outbox`);
  let made = 0;
  for (const { org_id: orgId } of orgs) {
    const jobs = await inScope(db, { orgId }, async (tx) => {
      const queued = await tx
        .select({ event: events })
        .from(webhookOutbox)
        .innerJoin(events, eq(events.id, webhookOutbox.eventId))
        .orderBy(webhookOutbox.eventId)
        .limit(200)
        .for("update", { of: webhookOutbox, skipLocked: true });
      if (queued.length === 0) return [];
      const active = await tx.select().from(webhooks).where(isNull(webhooks.disabledAt));
      const out: DeliveryJob[] = [];
      for (const { event } of queued) {
        const to = await targets(tx, event, active);
        if (to.length > 0) {
          const body = await eventPayload(tx, event);
          const rows = await tx
            .insert(webhookDeliveries)
            .values(to.map((hook) => ({ orgId, webhookId: hook.id, eventId: event.id, requestBody: body })))
            .onConflictDoNothing()
            .returning({ id: webhookDeliveries.id });
          out.push(...rows.map((row) => ({ orgId, deliveryId: row.id })));
        }
      }
      await tx.delete(webhookOutbox).where(inArray(webhookOutbox.eventId, queued.map((q) => q.event.id)));
      return out;
    });
    // After the commit. A crash in between leaves pending deliveries, which
    // the sweep queues again; the job id makes a second send a no-op.
    await queue(jobs);
    made += jobs.length;
  }
  return made;
}

export function sign(secret: string, body: string, at = Math.floor(Date.now() / 1000)): string {
  return `t=${at},v1=${createHmac("sha256", secret).update(`${at}.${body}`).digest("hex")}`;
}

// One attempt at a delivery. Throws when it should be retried. `last` says
// this is the final attempt: a failure then disables the webhook.
export async function attempt(db: Database, job: DeliveryJob, last: boolean, allowPrivate = false): Promise<void> {
  const found = await inScope(db, { orgId: job.orgId }, async (tx) => {
    const [row] = await tx
      .select({ delivery: webhookDeliveries, webhook: webhooks, eventType: events.type })
      .from(webhookDeliveries)
      .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
      .innerJoin(events, eq(events.id, webhookDeliveries.eventId))
      .where(eq(webhookDeliveries.id, job.deliveryId));
    return row;
  });
  // Gone with its webhook, or already sent.
  if (found?.delivery.status !== "pending") return;
  const { delivery, webhook } = found;
  if (webhook.disabledAt) {
    await inScope(db, { orgId: job.orgId }, (tx) =>
      tx
        .update(webhookDeliveries)
        .set({ status: "failed", responseBody: "Not sent: the webhook is turned off." })
        .where(eq(webhookDeliveries.id, delivery.id)),
    );
    return;
  }

  const started = Date.now();
  let status: number | null = null;
  let response: string;
  try {
    const res = await sendWebhook(
      webhook.url,
      {
        "content-type": "application/json",
        "user-agent": "Edict-Webhooks/1",
        "edict-event": found.eventType,
        "edict-delivery": delivery.id,
        "edict-signature": sign(webhook.secret, delivery.requestBody),
      },
      delivery.requestBody,
      { allowPrivate, timeoutMs: 10_000, maxBody: 2048 },
    );
    status = res.status;
    response = res.body;
  } catch (error) {
    response = `No response: ${error instanceof Error ? error.message : String(error)}`.slice(0, 2048);
  }
  const ok = status !== null && status >= 200 && status < 300;
  const outcome = ok ? "delivered" : last ? "failed" : "pending";

  await inScope(db, { orgId: job.orgId }, async (tx) => {
    await tx
      .update(webhookDeliveries)
      .set({
        status: outcome,
        attempts: sql`${webhookDeliveries.attempts} + 1`,
        responseStatus: status,
        responseBody: response,
        durationMs: Date.now() - started,
        lastAttemptAt: new Date(),
        deliveredAt: ok ? new Date() : null,
      })
      .where(eq(webhookDeliveries.id, delivery.id));
    if (outcome === "failed") {
      const reason = `Deliveries failed for about a day; the last answered ${status ?? "nothing"}.`;
      const [disabled] = await tx
        .update(webhooks)
        .set({ disabledAt: new Date(), disabledReason: reason, version: sql`${webhooks.version} + 1` })
        .where(and(eq(webhooks.id, webhook.id), isNull(webhooks.disabledAt)))
        .returning();
      if (disabled) {
        // No one acted, so the event names who set the webhook up.
        await emit(tx, job.orgId, {
          type: "webhook.disabled",
          actorId: webhook.agentId ?? webhook.createdBy,
          subjectId: webhook.id,
          data: { reason, url: webhook.url, deliveryId: delivery.id, version: disabled.version },
        });
      }
    }
  });
  if (!ok && !last) {
    throw new Error(`Webhook delivery ${delivery.id} answered ${status ?? "nothing"}; retrying.`);
  }
}

// Deliveries left pending without a job, like after a crash between the
// dispatcher's commit and queueing its jobs.
export async function stalledDeliveries(db: Database): Promise<DeliveryJob[]> {
  const { rows } = await db.execute<{ org_id: string; id: string }>(sql`
    SELECT org_id, id FROM webhook_deliveries
    WHERE status = 'pending' AND attempts = 0 AND created_at < now() - interval '1 minute'
    LIMIT 500`);
  return rows.map((row) => ({ orgId: row.org_id, deliveryId: row.id }));
}

// Starts delivering: listens for emit's notifications, sweeps every 30
// seconds, and works the delivery queue.
export async function startWebhooks(
  db: Database,
  boss: PgBoss,
  listen: (onNotify: () => void) => Promise<() => Promise<void>>,
  { retry, allowPrivate }: DeliveryOptions,
): Promise<() => Promise<void>> {
  await boss.createQueue(DELIVERY_QUEUE, {
    retryLimit: retry.limit,
    retryDelay: retry.delaySeconds,
    retryBackoff: true,
    retryDelayMax: 4 * 60 * 60,
  });
  const queue = async (jobs: DeliveryJob[]) => {
    for (const job of jobs) {
      await boss.send(DELIVERY_QUEUE, job, { id: job.deliveryId });
    }
  };

  let running: Promise<void> | undefined;
  let again = false;
  const run = () => {
    if (running) {
      again = true;
      return;
    }
    running = (async () => {
      do {
        again = false;
        try {
          await dispatch(db, queue);
        } catch (error) {
          console.error("webhook dispatch:", error);
        }
      } while (again);
    })().finally(() => (running = undefined));
  };

  await boss.work<DeliveryJob, void, { includeMetadata: true }>(DELIVERY_QUEUE, { includeMetadata: true }, async ([job]) => {
    await attempt(db, job!.data, job!.retryCount >= retry.limit, allowPrivate);
  });
  const unlisten = await listen(run);
  const sweep = setInterval(() => {
    run();
    void stalledDeliveries(db).then(queue).catch((error) => console.error("webhook sweep:", error));
  }, 30_000);
  run();

  return async () => {
    clearInterval(sweep);
    await unlisten();
    await running;
  };
}
