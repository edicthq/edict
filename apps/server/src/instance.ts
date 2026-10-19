import { randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import {
  inScope,
  instanceEvents,
  instanceSettings,
  invites,
  members,
  user,
  type Database,
} from "@edicthq/db";
import type { SignUpMode } from "@edicthq/schema";

export type InstanceSettingsRow = typeof instanceSettings.$inferSelect;

// The first replica to boot creates the settings row, including the secret
// that signs sessions when BETTER_AUTH_SECRET is not set. So sessions survive
// restarts and every replica signs alike.
export async function ensureInstanceSettings(db: Database): Promise<InstanceSettingsRow> {
  await db
    .insert(instanceSettings)
    .values({ authSecret: randomBytes(32).toString("hex") })
    .onConflictDoNothing();
  return readInstanceSettings(db);
}

export async function readInstanceSettings(db: Database): Promise<InstanceSettingsRow> {
  const [row] = await db.select().from(instanceSettings);
  if (!row) {
    throw new Error("instance_settings is empty; ensureInstanceSettings runs on boot");
  }
  return row;
}

export async function setSignUp(
  db: Database,
  actorUserId: string,
  change: { signUpMode?: SignUpMode; signUpDomains?: string[] },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(instanceSettings).for("update");
    if (!current) return;
    if (change.signUpMode && change.signUpMode !== current.signUpMode) {
      await tx.update(instanceSettings).set({ signUpMode: change.signUpMode });
      await tx.insert(instanceEvents).values({
        type: "instance.sign_up_mode_changed",
        actorUserId,
        data: { from: current.signUpMode, to: change.signUpMode },
      });
    }
    const domains = change.signUpDomains && [...new Set(change.signUpDomains)].sort();
    if (domains && JSON.stringify(domains) !== JSON.stringify(current.signUpDomains)) {
      await tx.update(instanceSettings).set({ signUpDomains: domains });
      await tx.insert(instanceEvents).values({
        type: "instance.sign_up_domains_changed",
        actorUserId,
        data: { from: current.signUpDomains, to: domains },
      });
    }
  });
}

// The lowercase domain of an address.
export function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

export async function hasUsers(db: Database): Promise<boolean> {
  const [users] = await db.select({ n: count() }).from(user);
  return (users?.n ?? 0) > 0;
}

// Whether the sign-up mode lets this email become a user. The first user is
// always let in: someone has to become the instance admin.
export async function maySignUp(db: Database, email: string): Promise<boolean> {
  if (!(await hasUsers(db))) {
    return true;
  }
  const settings = await readInstanceSettings(db);
  if (settings.signUpMode === "open") {
    return true;
  }
  if (settings.signUpMode === "domain" && settings.signUpDomains.includes(domainOf(email))) {
    return true;
  }
  return hasOpenInvite(db, email);
}

// Whether a signed-in user may use the API. Only the domain sign-up mode holds
// one back: a user whose address is unverified, who has no invite and belongs
// to no organization got in on the domain alone, which proves nothing yet.
export async function mayActUnverified(db: Database, userId: string): Promise<boolean> {
  const settings = await readInstanceSettings(db);
  if (settings.signUpMode !== "domain") return true;
  const [person] = await db.select({ email: user.email, verified: user.emailVerified, role: user.role }).from(user).where(eq(user.id, userId));
  if (!person || person.verified || person.role === "admin") return true;
  if (!settings.signUpDomains.includes(domainOf(person.email))) return true;
  const memberships = await inScope(db, { userId }, (tx) =>
    tx.select({ id: members.id }).from(members).where(and(eq(members.userId, userId), isNull(members.removedAt))).limit(1),
  );
  return memberships.length > 0 || (await hasOpenInvite(db, person.email));
}

async function hasOpenInvite(db: Database, email: string): Promise<boolean> {
  const normalized = email.toLowerCase();
  const open = await inScope(db, { inviteEmail: normalized }, (tx) =>
    tx
      .select({ id: invites.id })
      .from(invites)
      .where(
        and(
          eq(invites.email, normalized),
          isNull(invites.acceptedAt),
          isNull(invites.revokedAt),
          gt(invites.expiresAt, new Date()),
        ),
      )
      .limit(1),
  );
  return open.length > 0;
}
