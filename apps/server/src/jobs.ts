// Background jobs on pg-boss, which keeps its queue in Postgres (ADR 0007):
// the daily trash purge (ADR 0019) and webhook deliveries (ADR 0022).
import { PgBoss } from "pg-boss";
import { and, eq, inArray, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import {
  attachments,
  comments,
  emit,
  inScope,
  issues,
  projects,
  teams,
  webhookDeliveries,
  WEBHOOK_CHANNEL,
  type Database,
  type Pool,
} from "@edicthq/db";
import type { AttachmentStorage } from "./storage.js";
import { DELIVERY_QUEUE, startWebhooks, type DeliveryJob, type DeliveryOptions } from "./webhooks.js";

// How long the trash keeps what it holds.
export const TRASH_DAYS = 30;

export interface PurgeResult {
  issues: number;
  comments: number;
  projects: number;
  teams: number;
  files: number;
}

// Removes teams, issues, comments and projects deleted more than TRASH_DAYS
// before `now`, and the files of the issues. What a purged issue holds goes
// with it, and a purged team takes its issues, statuses, labels and keys,
// which another team can then take (ADR 0017). The purge is not a change
// anyone made, so it writes no events, and the events about what it removes
// stay in the log.
export async function purgeTrash(db: Database, storage: AttachmentStorage, now = new Date()): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - TRASH_DAYS * 24 * 60 * 60 * 1000);
  // Which organizations have anything due, read across tenants; each purge
  // then runs in its own organization's scope like any other write.
  const { rows: orgs } = await db.execute<{ org_id: string }>(sql`
    SELECT org_id FROM issues WHERE deleted_at < ${cutoff}
    UNION
    SELECT org_id FROM comments WHERE deleted_at < ${cutoff}
    UNION
    SELECT org_id FROM projects WHERE deleted_at < ${cutoff}
    UNION
    SELECT org_id FROM teams WHERE deleted_at < ${cutoff}`);

  const result: PurgeResult = { issues: 0, comments: 0, projects: 0, teams: 0, files: 0 };
  for (const { org_id: orgId } of orgs) {
    const keys = await inScope(db, { orgId }, async (tx) => {
      const dueTeams = await tx
        .select({ id: teams.id })
        .from(teams)
        .where(and(isNotNull(teams.deletedAt), lt(teams.deletedAt, cutoff)));
      const teamIds = dueTeams.map((row) => row.id);
      const due = await tx
        .select({ id: issues.id })
        .from(issues)
        .where(
          or(
            and(isNotNull(issues.deletedAt), lt(issues.deletedAt, cutoff)),
            teamIds.length ? inArray(issues.teamId, teamIds) : undefined,
          ),
        );
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
      const purgedProjects = await tx
        .delete(projects)
        .where(and(isNotNull(projects.deletedAt), lt(projects.deletedAt, cutoff)))
        .returning({ id: projects.id });
      if (teamIds.length) await tx.delete(teams).where(inArray(teams.id, teamIds));
      result.issues += ids.length;
      result.comments += purgedComments.length;
      result.projects += purgedProjects.length;
      result.teams += teamIds.length;
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

// Archives issues closed longer than their team's archiveAfterDays (ADR
// 0025). Each archive is an event; its actor is whoever closed the issue,
// since nobody acted now. Returns how many issues it archived.
export async function archiveClosedIssues(db: Database, now = new Date()): Promise<number> {
  const { rows: orgs } = await db.execute<{ org_id: string }>(sql`
    SELECT DISTINCT i.org_id FROM issues i JOIN teams t ON t.id = i.team_id
    WHERE i.archived_at IS NULL AND i.deleted_at IS NULL AND t.deleted_at IS NULL
      AND t.archive_after_days IS NOT NULL
      AND i.closed_at < ${now}::timestamptz - make_interval(days => t.archive_after_days)`);
  let archived = 0;
  for (const { org_id: orgId } of orgs) {
    archived += await inScope(db, { orgId }, async (tx) => {
      const due = await tx
        .select({ issue: issues, key: teams.key })
        .from(issues)
        .innerJoin(teams, eq(teams.id, issues.teamId))
        .where(
          and(
            isNull(issues.archivedAt),
            isNull(issues.deletedAt),
            isNull(teams.deletedAt),
            isNotNull(teams.archiveAfterDays),
            sql`${issues.closedAt} < ${now}::timestamptz - make_interval(days => ${teams.archiveAfterDays})`,
          ),
        )
        .for("update", { of: issues });
      for (const { issue, key } of due) {
        await tx.update(issues).set({ archivedAt: now }).where(eq(issues.id, issue.id));
        await emit(tx, orgId, {
          type: "issue.archived",
          actorId: issue.closedBy ?? issue.creatorId,
          subjectId: issue.id,
          data: { identifier: `${key}-${issue.number}`, automatic: true },
        });
      }
      return due.length;
    });
  }
  return archived;
}

const purgeQueue = "trash-purge";

// The delivery log keeps each delivery this long.
export const DELIVERY_LOG_DAYS = 30;

export async function purgeDeliveries(db: Database, now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - DELIVERY_LOG_DAYS * 24 * 60 * 60 * 1000);
  const { rows: orgs } = await db.execute<{ org_id: string }>(
    sql`SELECT DISTINCT org_id FROM webhook_deliveries WHERE created_at < ${cutoff}`,
  );
  for (const { org_id: orgId } of orgs) {
    await inScope(db, { orgId }, (tx) => tx.delete(webhookDeliveries).where(lt(webhookDeliveries.createdAt, cutoff)));
  }
}

export interface Jobs {
  queueDelivery: (job: DeliveryJob) => Promise<void>;
  stop: () => Promise<void>;
}

// Starts pg-boss with its schema beside Edict's, schedules the daily purge and
// works it, and delivers webhooks. pg-boss's own lock keeps replicas from
// running the purge twice.
export async function startJobs(
  databaseUrl: string,
  db: Database,
  pool: Pool,
  storage: AttachmentStorage,
  delivery: DeliveryOptions,
): Promise<Jobs> {
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
    await purgeDeliveries(db);
    const archived = await archiveClosedIssues(db);
    if (archived) console.info(`archive: ${archived} closed issues`);
  });
  const stopWebhooks = await startWebhooks(db, boss, (onNotify) => listen(pool, onNotify), delivery);
  return {
    queueDelivery: async (job) => {
      await boss.send(DELIVERY_QUEUE, job, { id: job.deliveryId });
    },
    stop: async () => {
      await stopWebhooks();
      await boss.stop({ graceful: true });
    },
  };
}

// Holds one connection that LISTENs for emit's notifications.
async function listen(pool: Pool, onNotify: () => void): Promise<() => Promise<void>> {
  const client = await pool.connect();
  client.on("notification", onNotify);
  await client.query(`LISTEN ${WEBHOOK_CHANNEL}`);
  return async () => {
    client.off("notification", onNotify);
    await client.query(`UNLISTEN ${WEBHOOK_CHANNEL}`).catch(() => undefined);
    client.release();
  };
}
