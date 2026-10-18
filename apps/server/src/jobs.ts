// Background jobs on pg-boss, which keeps its queue in Postgres (ADR 0007).
// The trash purge is the first (ADR 0019); M3's webhook deliveries join it.
import { PgBoss } from "pg-boss";
import { and, inArray, isNotNull, lt, notInArray, sql } from "drizzle-orm";
import { attachments, comments, inScope, issues, type Database } from "@edicthq/db";
import type { AttachmentStorage } from "./storage.js";

// How long the trash keeps what it holds.
export const TRASH_DAYS = 30;

export interface PurgeResult {
  issues: number;
  comments: number;
  files: number;
}

// Removes issues and comments deleted more than TRASH_DAYS before `now`, and
// the files of the issues. Comments, attachments, labels and relations of a
// purged issue go with it. The purge is not a change anyone made, so it
// writes no events, and the events about what it removes stay in the log.
export async function purgeTrash(db: Database, storage: AttachmentStorage, now = new Date()): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - TRASH_DAYS * 24 * 60 * 60 * 1000);
  // Which organizations have anything due, read across tenants; each purge
  // then runs in its own organization's scope like any other write.
  const { rows: orgs } = await db.execute<{ org_id: string }>(sql`
    SELECT org_id FROM issues WHERE deleted_at < ${cutoff}
    UNION
    SELECT org_id FROM comments WHERE deleted_at < ${cutoff}`);

  const result: PurgeResult = { issues: 0, comments: 0, files: 0 };
  for (const { org_id: orgId } of orgs) {
    const keys = await inScope(db, { orgId }, async (tx) => {
      const due = await tx
        .select({ id: issues.id })
        .from(issues)
        .where(and(isNotNull(issues.deletedAt), lt(issues.deletedAt, cutoff)));
      const ids = due.map((row) => row.id);
      let files: { id: string }[] = [];
      if (ids.length > 0) {
        files = await tx.select({ id: attachments.id }).from(attachments).where(inArray(attachments.issueId, ids));
        // A sub-issue restored on its own outlives its parent, and loses it,
        // as a foreign key's ON DELETE SET NULL would.
        await tx
          .update(issues)
          .set({ parentId: null })
          .where(and(inArray(issues.parentId, ids), notInArray(issues.id, ids)));
        await tx.delete(issues).where(inArray(issues.id, ids));
      }
      const purgedComments = await tx
        .delete(comments)
        .where(and(isNotNull(comments.deletedAt), lt(comments.deletedAt, cutoff)))
        .returning({ id: comments.id });
      result.issues += ids.length;
      result.comments += purgedComments.length;
      return files.map((file) => `${orgId}/${file.id}`);
    });
    // After the commit: a file whose row is gone can never be served, so a
    // failure here leaves only an orphan on disk.
    for (const key of keys) {
      await storage.delete(key);
      result.files++;
    }
  }
  return result;
}

const purgeQueue = "trash-purge";

// Starts pg-boss with its schema beside Edict's, schedules the daily purge and
// works it. pg-boss's own lock keeps replicas from running it twice.
export async function startJobs(databaseUrl: string, db: Database, storage: AttachmentStorage): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: databaseUrl, schema: "pgboss" });
  boss.on("error", (error) => console.error("background jobs:", error));
  await boss.start();
  await boss.createQueue(purgeQueue);
  await boss.schedule(purgeQueue, "17 3 * * *");
  await boss.work(purgeQueue, async () => {
    const purged = await purgeTrash(db, storage);
    if (purged.issues || purged.comments) {
      console.info(`trash purge: ${purged.issues} issues, ${purged.comments} comments, ${purged.files} files`);
    }
  });
  return boss;
}
