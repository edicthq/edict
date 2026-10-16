import { randomBytes } from "node:crypto";
import { instanceSettings, type Database } from "@edicthq/db";

// Without BETTER_AUTH_SECRET, the first replica to boot generates the secret
// and stores it, so sessions survive restarts and every replica signs alike.
export async function instanceAuthSecret(db: Database): Promise<string> {
  await db
    .insert(instanceSettings)
    .values({ authSecret: randomBytes(32).toString("hex") })
    .onConflictDoNothing();

  const [row] = await db.select({ authSecret: instanceSettings.authSecret }).from(instanceSettings);
  if (!row) {
    throw new Error("instance_settings is empty after insert");
  }
  return row.authSecret;
}
