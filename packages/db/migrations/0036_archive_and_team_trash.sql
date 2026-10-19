ALTER TABLE "teams" ADD COLUMN "archive_after_days" integer DEFAULT 30;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "deleted_change_id" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "closed_by" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "issues_team_id_archived_at_idx" ON "issues" USING btree ("team_id","archived_at");--> statement-breakpoint
CREATE INDEX "issues_closed_at_idx" ON "issues" USING btree ("closed_at") WHERE "issues"."closed_at" IS NOT NULL AND "issues"."archived_at" IS NULL;--> statement-breakpoint
-- Purging a team from the trash removes its row (ADR 0019).
GRANT DELETE ON teams TO edict_app;
--> statement-breakpoint
-- Issues closed before closed_at existed count from their last update.
UPDATE issues SET closed_at = i.updated_at, closed_by = i.creator_id
  FROM issues i JOIN statuses s ON s.id = i.status_id
  WHERE issues.id = i.id AND s.category IN ('done', 'canceled');
