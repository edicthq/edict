CREATE TYPE "public"."priority" AS ENUM('urgent', 'high', 'medium', 'low', 'none');--> statement-breakpoint
CREATE TYPE "public"."status_category" AS ENUM('backlog', 'todo', 'in_progress', 'done', 'canceled');--> statement-breakpoint
CREATE TABLE "team_keys" (
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"team_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_keys_org_id_key_pk" PRIMARY KEY("org_id","key")
);
--> statement-breakpoint
CREATE TABLE "issue_numbers" (
	"org_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"issue_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_numbers_team_id_number_pk" PRIMARY KEY("team_id","number")
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status_id" uuid NOT NULL,
	"priority" "priority" DEFAULT 'none' NOT NULL,
	"estimate" integer,
	"assignee_id" uuid,
	"creator_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"field_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issues_org_id_id_unique" UNIQUE("org_id","id"),
	CONSTRAINT "issues_team_id_number_unique" UNIQUE("team_id","number"),
	CONSTRAINT "issues_estimate_not_negative" CHECK ("issues"."estimate" >= 0)
);
--> statement-breakpoint
CREATE TABLE "statuses" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" "status_category" NOT NULL,
	"position" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "statuses_org_id_team_id_id_unique" UNIQUE("org_id","team_id","id")
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "issue_counter" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "change_id" uuid;--> statement-breakpoint
-- Events from before changes existed each count as their own change.
UPDATE "events" SET "change_id" = "id";--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "change_id" SET DEFAULT nullif(current_setting('edict.change_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "change_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "team_keys" ADD CONSTRAINT "team_keys_team_fk" FOREIGN KEY ("org_id","team_id") REFERENCES "public"."teams"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_numbers" ADD CONSTRAINT "issue_numbers_team_fk" FOREIGN KEY ("org_id","team_id") REFERENCES "public"."teams"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_team_fk" FOREIGN KEY ("org_id","team_id") REFERENCES "public"."teams"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_status_fk" FOREIGN KEY ("org_id","team_id","status_id") REFERENCES "public"."statuses"("org_id","team_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignee_fk" FOREIGN KEY ("org_id","assignee_id") REFERENCES "public"."members"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_creator_fk" FOREIGN KEY ("org_id","creator_id") REFERENCES "public"."members"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_team_fk" FOREIGN KEY ("org_id","team_id") REFERENCES "public"."teams"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_keys_team_id_idx" ON "team_keys" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "issue_numbers_issue_id_idx" ON "issue_numbers" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issues_assignee_id_idx" ON "issues" USING btree ("assignee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "statuses_team_id_name_unique" ON "statuses" USING btree ("team_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "statuses_team_id_default_unique" ON "statuses" USING btree ("team_id") WHERE "statuses"."is_default";--> statement-breakpoint
CREATE INDEX "events_change_id_idx" ON "events" USING btree ("change_id");