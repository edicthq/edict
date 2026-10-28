CREATE TYPE "public"."progress_source" AS ENUM('agent', 'activity', 'hook');--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"org_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"issue_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_sessions_agent_id_session_id_pk" PRIMARY KEY("agent_id","session_id")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "scope" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "progress_updates" ADD COLUMN "source" "progress_source" DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_agent_fk" FOREIGN KEY ("org_id","agent_id") REFERENCES "public"."members"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_issue_fk" FOREIGN KEY ("org_id","issue_id") REFERENCES "public"."issues"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_scope_check" CHECK ("scope" IN ('full', 'hooks'));
--> statement-breakpoint

-- Row-level security and grants for agent sessions (ADR 0029), as in
-- 0004_row_level_security.sql.
GRANT SELECT, INSERT, UPDATE, DELETE ON agent_sessions TO edict_app;
--> statement-breakpoint
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY agent_sessions_tenant ON agent_sessions TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
