---
status: accepted
---

# Webhooks deliver from the event log through a transactional outbox

Builds on [ADR 0005](./0005-transactional-event-log.md) and [ADR 0007](./0007-postgres-only-dependency.md).

A webhook sends events to an outside URL. An organization-level webhook receives every event type it subscribes to. An agent's webhook also receives every event about an issue while that issue is delegated to the agent, which is how agent runners wake up.

**Outbox.** `emit` writes the event and, when the organization has an active webhook, a row in `webhook_outbox` in the same transaction. A dispatcher takes outbox rows with `FOR UPDATE SKIP LOCKED`, decides which webhooks each event goes to, writes one delivery per webhook and queues a pg-boss job for each, all in one transaction. `NOTIFY` wakes the dispatcher right after a commit, and a sweep every 30 seconds catches anything a missed notification left behind. An event can never commit without its outbox row, and a delivery can never be queued twice for the same event and webhook.

**Delivery.** A `POST` with a JSON body: the event's id, type, time, change, actor, "on behalf of", subject and data. Headers `Edict-Event`, `Edict-Delivery` and `Edict-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`, signed with the webhook's secret. Any 2xx response counts as delivered. Anything else, or no answer within 10 seconds, is retried with exponential backoff for about 24 hours. Receivers deduplicate on the event id, since delivery is at least once.

**Failure.** When a delivery runs out of retries, the webhook disables itself and writes a `webhook.disabled` event. Admins see it on the webhooks page, and the inbox picks it up in M5. Pausing an agent disables its webhooks too.

**Log.** Each delivery keeps its request, its last response status and a truncated body, the attempt count and its timing, for 30 days. Redelivering queues the same payload again as a new delivery.

## Considered options

- **Read the event log with a cursor.** No outbox table, but UUIDv7 order is not commit order: a slow transaction commits an older id after the cursor has moved past it, and its event is never sent.
- **A Postgres trigger on `events`.** Same guarantee, but the rule would live in SQL away from `emit`, which is the one place that writes events.
- **Queue pg-boss jobs straight from the request's transaction.** Couples every write to pg-boss's schema and pays its cost when nobody subscribes.

## Consequences

- A write in an organization with no active webhook pays one cheap indexed query for the outbox and nothing else.
- The webhook secret is stored in a form Edict can read back, since it signs with it. It is shown in full only when the webhook is created or its secret rotated.
