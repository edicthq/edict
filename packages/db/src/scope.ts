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
}

// The data-access layer's entry point for tenant data (ADR 0006). Runs fn in
// one transaction as the edict_app role, so row-level security applies, with
// the scope set as transaction-local settings the policies read.
export function inScope<T>(db: Database, scope: Scope, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE edict_app`);
    await tx.execute(sql`SELECT
      set_config('edict.org_id', ${scope.orgId ?? ""}, true),
      set_config('edict.user_id', ${scope.userId ?? ""}, true),
      set_config('edict.invite_token_hash', ${scope.inviteTokenHash ?? ""}, true)`);
    return fn(tx);
  });
}

// Narrows a running scope to one organization, once its id is known: after
// creating it, or after finding an invite by its token.
export async function enterOrg(tx: Transaction, orgId: string): Promise<void> {
  await tx.execute(sql`SELECT set_config('edict.org_id', ${orgId}, true)`);
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
export async function emit(tx: Transaction, orgId: string, event: NewEvent): Promise<void> {
  await tx.insert(events).values({
    orgId,
    type: event.type,
    actorId: event.actorId,
    onBehalfOfId: event.onBehalfOfId ?? null,
    subjectId: event.subjectId,
    data: event.data ?? {},
  });
}
