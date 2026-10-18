import { sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { events } from "./events.js";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface Scope {
  // The organization whose rows are visible and writable.
  orgId?: string;
  // The signed-in user. Their member rows in every organization stay
  // readable, so they can list their organizations.
  userId?: string;
  // Lets one invite be read by its token hash before its organization is known.
  inviteTokenHash?: string;
  // Lets the invites for one lowercase email be read, but not changed, across
  // organizations. Invite-only sign-up uses it.
  inviteEmail?: string;
  // Lets one attachment be read by its id before its organization is known,
  // so the /files path can find it and check the caller can see its issue.
  attachmentId?: string;
  // Lets the API key with this SHA-256 hash be read before its organization
  // is known (ADR 0021).
  apiKeyHash?: string;
  // Lets the OAuth access token with this hash be read before its
  // organization is known (ADR 0021).
  oauthTokenHash?: string;
}

// The data-access layer's entry point for tenant data (ADR 0006). Runs fn in
// one transaction as the edict_app role, so row-level security applies, with
// the scope set as transaction-local settings the policies read. Each scope is
// one change (ADR 0019): every event it emits gets the same change id.
export function inScope<T>(db: Database, scope: Scope, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE edict_app`);
    await tx.execute(sql`SELECT
      set_config('edict.org_id', ${scope.orgId ?? ""}, true),
      set_config('edict.user_id', ${scope.userId ?? ""}, true),
      set_config('edict.invite_token_hash', ${scope.inviteTokenHash ?? ""}, true),
      set_config('edict.invite_email', ${scope.inviteEmail ?? ""}, true),
      set_config('edict.attachment_id', ${scope.attachmentId ?? ""}, true),
      set_config('edict.api_key_hash', ${scope.apiKeyHash ?? ""}, true),
      set_config('edict.oauth_token_hash', ${scope.oauthTokenHash ?? ""}, true),
      set_config('edict.on_behalf_of', '', true),
      set_config('edict.change_id', uuidv7()::text, true)`);
    return fn(tx);
  });
}

// Narrows a running scope to one organization, once its id is known: after
// creating it, or after finding an invite by its token.
export async function enterOrg(tx: Transaction, orgId: string): Promise<void> {
  await tx.execute(sql`SELECT set_config('edict.org_id', ${orgId}, true)`);
}

// Records, for every event the rest of the scope writes, the human whose OAuth
// approval lets the acting agent act (ADR 0021).
export async function onBehalfOf(tx: Transaction, memberId: string): Promise<void> {
  await tx.execute(sql`SELECT set_config('edict.on_behalf_of', ${memberId}, true)`);
}

export interface NewEvent {
  type: string;
  actorId: string;
  onBehalfOfId?: string | null;
  subjectId: string;
  data?: Record<string, unknown>;
}

// Records a change in the event log (ADR 0005). Call it inside the same scope
// as the change, so both commit or neither does.
// When the organization has an active webhook, also queues the event for
// delivery in the same transaction (ADR 0022) and wakes the dispatcher once it
// commits.
export async function emit(tx: Transaction, orgId: string, event: NewEvent): Promise<void> {
  const [row] = await tx.insert(events).values({
    orgId,
    type: event.type,
    actorId: event.actorId,
    // Left out, it comes from the scope (onBehalfOf).
    onBehalfOfId: event.onBehalfOfId ?? undefined,
    subjectId: event.subjectId,
    data: event.data ?? {},
  }).returning({ id: events.id });
  await tx.execute(sql`
    WITH queued AS (
      INSERT INTO webhook_outbox (event_id, org_id)
      SELECT ${row!.id}, ${orgId}
      WHERE EXISTS (SELECT 1 FROM webhooks WHERE org_id = ${orgId} AND disabled_at IS NULL)
      RETURNING org_id
    )
    SELECT pg_notify(${WEBHOOK_CHANNEL}, org_id::text) FROM queued`);
}

// Where emit tells the webhook dispatcher there is work.
export const WEBHOOK_CHANNEL = "edict_webhooks";
