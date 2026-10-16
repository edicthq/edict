CREATE TYPE "public"."member_kind" AS ENUM('human', 'agent');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'admin', 'member', 'guest');--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "role" NOT NULL,
	"team_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"invited_by" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "member_kind" NOT NULL,
	"user_id" text,
	"role" "role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "members_org_id_id_unique" UNIQUE("org_id","id"),
	CONSTRAINT "members_org_id_user_id_unique" UNIQUE("org_id","user_id"),
	CONSTRAINT "members_agent_has_no_user" CHECK ("members"."kind" = 'human' OR "members"."user_id" IS NULL),
	CONSTRAINT "members_agent_role" CHECK ("members"."kind" = 'human' OR "members"."role" IN ('member', 'guest'))
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"org_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_id_member_id_pk" PRIMARY KEY("team_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"private" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_org_id_id_unique" UNIQUE("org_id","id"),
	CONSTRAINT "teams_org_id_key_unique" UNIQUE("org_id","key")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"on_behalf_of_id" uuid,
	"subject_id" uuid NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_org_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_fk" FOREIGN KEY ("org_id","invited_by") REFERENCES "public"."members"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_accepted_by_fk" FOREIGN KEY ("org_id","accepted_by") REFERENCES "public"."members"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_fk" FOREIGN KEY ("org_id","team_id") REFERENCES "public"."teams"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_member_fk" FOREIGN KEY ("org_id","member_id") REFERENCES "public"."members"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_org_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_actor_fk" FOREIGN KEY ("org_id","actor_id") REFERENCES "public"."members"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_on_behalf_of_fk" FOREIGN KEY ("org_id","on_behalf_of_id") REFERENCES "public"."members"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invites_open_email_unique" ON "invites" USING btree ("org_id","email") WHERE "invites"."accepted_at" IS NULL AND "invites"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "members_user_id_idx" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_members_member_id_idx" ON "team_members" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "events_org_id_id_idx" ON "events" USING btree ("org_id","id");--> statement-breakpoint
CREATE INDEX "events_subject_id_idx" ON "events" USING btree ("subject_id");