ALTER TABLE "comments" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "deleted_change_id" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "deleted_change_id" uuid;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_deleted_by_fk" FOREIGN KEY ("org_id","deleted_by") REFERENCES "public"."members"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_deleted_by_fk" FOREIGN KEY ("org_id","deleted_by") REFERENCES "public"."members"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_deleted_at_idx" ON "comments" USING btree ("deleted_at") WHERE "comments"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "issues_deleted_change_id_idx" ON "issues" USING btree ("deleted_change_id");--> statement-breakpoint
CREATE INDEX "issues_deleted_at_idx" ON "issues" USING btree ("deleted_at") WHERE "issues"."deleted_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_trash_together" CHECK (("comments"."deleted_at" IS NULL) = ("comments"."deleted_by" IS NULL) AND ("comments"."deleted_at" IS NULL) = ("comments"."deleted_change_id" IS NULL));--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_trash_together" CHECK (("issues"."deleted_at" IS NULL) = ("issues"."deleted_by" IS NULL) AND ("issues"."deleted_at" IS NULL) = ("issues"."deleted_change_id" IS NULL));