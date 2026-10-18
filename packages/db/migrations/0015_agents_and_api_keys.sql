CREATE TYPE "public"."agent_power" AS ENUM('delete', 'settings', 'members', 'agents');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"team_ids" uuid[],
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "on_behalf_of_id" SET DEFAULT nullif(current_setting('edict.on_behalf_of', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "connected_by" uuid;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "client_name" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "grants" "agent_power"[] DEFAULT '{}'::agent_power[] NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_agent_fk" FOREIGN KEY ("org_id","agent_id") REFERENCES "public"."members"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_fk" FOREIGN KEY ("org_id","created_by") REFERENCES "public"."members"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_agent_id_idx" ON "api_keys" USING btree ("agent_id");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_connected_by_fk" FOREIGN KEY ("org_id","connected_by") REFERENCES "public"."members"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "members_connected_client_unique" ON "members" USING btree ("org_id","connected_by","client_name") WHERE "members"."connected_by" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_agent_has_name" CHECK ("members"."kind" = 'human' OR "members"."name" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_human_is_not_connected" CHECK ("members"."kind" = 'agent' OR ("members"."connected_by" IS NULL AND "members"."paused_at" IS NULL));