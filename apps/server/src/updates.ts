// The update check. Once a day the instance asks GitHub for Edict's latest
// release and keeps the answer, so the instance page can say a newer version
// is out. An instance admin can turn it off, and then nothing is sent.
//
// The request is a plain GET of a public URL. It carries no cookie, no
// instance URL and no version: the user agent GitHub requires is just "Edict".
import type { Database } from "@edicthq/db";
import { instanceSettings } from "@edicthq/db";
import type { UpdateCheck } from "@edicthq/schema";
import { readInstanceSettings, type InstanceSettingsRow } from "./instance.js";
import { isNewer, VERSION } from "./version.js";

export const RELEASES_URL = "https://api.github.com/repos/edicthq/edict/releases/latest";

export function updateCheckOf(settings: InstanceSettingsRow): UpdateCheck {
  const latest = settings.latestRelease ?? null;
  return {
    check: settings.updateCheck,
    latest,
    available: latest !== null && isNewer(latest.version, VERSION),
    checkedAt: settings.updateCheckedAt?.toISOString() ?? null,
    error: settings.updateCheckError,
  };
}

// Asks for the latest release and records the answer, or the error. Does
// nothing when the check is off.
export async function checkForUpdate(db: Database, releasesUrl: string, now = new Date()): Promise<UpdateCheck> {
  const settings = await readInstanceSettings(db);
  if (!settings.updateCheck) return updateCheckOf(settings);
  let change: Partial<InstanceSettingsRow>;
  try {
    change = { latestRelease: await fetchLatestRelease(releasesUrl), updateCheckError: null };
  } catch (error) {
    change = { updateCheckError: error instanceof Error ? error.message : String(error) };
  }
  await db.update(instanceSettings).set({ ...change, updateCheckedAt: now });
  return updateCheckOf(await readInstanceSettings(db));
}

async function fetchLatestRelease(url: string): Promise<NonNullable<InstanceSettingsRow["latestRelease"]>> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/vnd.github+json", "user-agent": "Edict" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new Error(`GitHub could not be reached: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const body = (await res.json()) as { tag_name?: unknown; html_url?: unknown; published_at?: unknown };
  const tag = typeof body.tag_name === "string" ? body.tag_name : "";
  const version = tag.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`The latest release is tagged ${JSON.stringify(body.tag_name ?? null)}, which is not a version`);
  }
  const published = typeof body.published_at === "string" ? new Date(body.published_at) : null;
  return {
    version,
    url: typeof body.html_url === "string" ? body.html_url : `https://github.com/edicthq/edict/releases/tag/${tag}`,
    publishedAt: published && !Number.isNaN(published.getTime()) ? published.toISOString() : null,
  };
}
