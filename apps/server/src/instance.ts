import { randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import {
  inScope,
  instanceEvents,
  instanceSettings,
  invites,
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

export async function setSignUpMode(db: Database, actorUserId: string, mode: SignUpMode): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(instanceSettings).for("update");
    if (!current || current.signUpMode === mode) {
      return;
    }
    await tx.update(instanceSettings).set({ signUpMode: mode });
    await tx.insert(instanceEvents).values({
      type: "instance.sign_up_mode_changed",
      actorUserId,
      data: { from: current.signUpMode, to: mode },
    });
  });
}

// Whether the sign-up mode lets this email become a user. The first user is
// always let in: someone has to become the instance admin.
export async function maySignUp(db: Database, email: string): Promise<boolean> {
  const [users] = await db.select({ n: count() }).from(user);
  if (!users || users.n === 0) {
    return true;
  }
  const settings = await readInstanceSettings(db);
  if (settings.signUpMode === "open") {
    return true;
  }
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
