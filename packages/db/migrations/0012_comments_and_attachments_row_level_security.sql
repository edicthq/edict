-- Row-level security and grants for comments and attachments (ADR 0009,
-- ADR 0020), as in 0004_row_level_security.sql.

GRANT SELECT, INSERT, UPDATE, DELETE ON comments TO edict_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON attachments TO edict_app;
--> statement-breakpoint

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY comments_tenant ON comments TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
--> statement-breakpoint

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- The id branch lets the /files path find one attachment before its
-- organization is known, as invites-by-token do; seeing its bytes still
-- passes the issue's visibility in the data-access layer.
CREATE FUNCTION edict_attachment_id() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('edict.attachment_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE POLICY attachments_select ON attachments FOR SELECT TO edict_app
  USING (org_id = edict_org_id() OR id = edict_attachment_id());
--> statement-breakpoint
CREATE POLICY attachments_insert ON attachments FOR INSERT TO edict_app
  WITH CHECK (org_id = edict_org_id());
