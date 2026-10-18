CREATE TYPE "public"."project_status" AS ENUM('planned', 'in_progress', 'paused', 'completed', 'canceled');--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "project_status" DEFAULT 'planned' NOT NULL,
	"lead_id" uuid,
	"start_date" timestamp with time zone,
	"target_date" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_change_id" uuid,
	CONSTRAINT "projects_org_id_id_unique" UNIQUE("org_id","id"),
	CONSTRAINT "projects_trash_together" CHECK (("projects"."deleted_at" IS NULL) = ("projects"."deleted_by" IS NULL) AND ("projects"."deleted_at" IS NULL) = ("projects"."deleted_change_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_fk" FOREIGN KEY ("org_id","lead_id") REFERENCES "public"."members"("org_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_deleted_by_fk" FOREIGN KEY ("org_id","deleted_by") REFERENCES "public"."members"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_org_id_slug_unique" ON "projects" USING btree ("org_id",lower("slug"));--> statement-breakpoint
CREATE INDEX "projects_lead_id_idx" ON "projects" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "projects_deleted_change_id_idx" ON "projects" USING btree ("deleted_change_id");--> statement-breakpoint
CREATE INDEX "projects_deleted_at_idx" ON "projects" USING btree ("deleted_at") WHERE "projects"."deleted_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issues_project_id_idx" ON "issues" USING btree ("project_id");