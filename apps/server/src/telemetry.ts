// Opt-in telemetry (ADR 0026). Off by default. When an instance admin turns
// it on, the instance sends one ping a day to Edict's collector: its version
// and how many users it has, as a bucket. Nothing else, and nothing while off.
import { count } from "drizzle-orm";
import { instanceSettings, user, type Database } from "@edicthq/db";
import type { Telemetry, TelemetryPing, UserCountBucket } from "@edicthq/schema";
import { readInstanceSettings, type InstanceSettingsRow } from "./instance.js";
import { VERSION } from "./version.js";

export const TELEMETRY_URL = "https://telemetry.edict.dev/v1/ping";

export function userCountBucket(users: number): UserCountBucket {
  if (users <= 1) return "1";
  if (users <= 10) return "2-10";
  if (users <= 50) return "11-50";
  if (users <= 200) return "51-200";
  if (users <= 1000) return "201-1000";
  return "1001+";
}

// The ping, exactly as it would be sent now.
export async function telemetryPayload(db: Database): Promise<TelemetryPing> {
  const [users] = await db.select({ n: count() }).from(user);
  return { version: VERSION, users: userCountBucket(users?.n ?? 0) };
}

export async function telemetryOf(db: Database, settings: InstanceSettingsRow): Promise<Telemetry> {
  return {
    enabled: settings.telemetry,
    payload: await telemetryPayload(db),
    sentAt: settings.telemetrySentAt?.toISOString() ?? null,
    error: settings.telemetryError,
  };
}

// Sends the ping if telemetry is on, and records when it went or why it failed.
export async function sendTelemetry(db: Database, telemetryUrl: string, now = new Date()): Promise<void> {
  if (!(await readInstanceSettings(db)).telemetry) return;
  const body = JSON.stringify(await telemetryPayload(db));
  let error: string | null = null;
  try {
    const res = await fetch(telemetryUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "Edict" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) error = `The collector answered ${res.status}`;
  } catch (cause) {
    error = `The collector could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
  await db
    .update(instanceSettings)
    .set(error ? { telemetryError: error } : { telemetrySentAt: now, telemetryError: null });
}
