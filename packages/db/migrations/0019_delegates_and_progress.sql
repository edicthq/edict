CREATE TYPE "public"."progress_state" AS ENUM('working', 'blocked', 'needs_input', 'done');--> statement-breakpoint
CREATE TABLE "progress_updates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"state" "progress_state" NOT NULL,
	"message" text NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "delegate_id" uuid;--> statement-breakpoint
ALTER TABLE "progress_updates" ADD CONSTRAINT "progress_updates_issue_fk" FOREIGN KEY ("org_id","issue_id") REFERENCES "public"."issues"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_updates" ADD CONSTRAINT "progress_updates_agent_fk" FOREIGN KEY ("org_id","agent_id") REFERENCES "public"."members"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "progress_updates_issue_id_id_idx" ON "progress_updates" USING btree ("issue_id","id");--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_delegate_fk" FOREIGN KEY ("org_id","delegate_id") REFERENCES "public"."members"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issues_delegate_id_idx" ON "issues" USING btree ("delegate_id");