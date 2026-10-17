CREATE TYPE "public"."sign_up_mode" AS ENUM('open', 'invite_only');--> statement-breakpoint
CREATE TABLE "instance_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"type" text NOT NULL,
	"actor_user_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "sign_up_mode" "sign_up_mode" DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_events" ADD CONSTRAINT "instance_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;