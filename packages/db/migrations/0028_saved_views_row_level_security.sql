-- Row-level security and grant for saved views (ADR 0023), as in
-- 0004_row_level_security.sql. A view is read and written in its
-- organization's like any other tenant row.

GRANT SELECT, INSERT, UPDATE, DELETE ON saved_views TO edict_app;
--> statement-breakpoint

ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY saved_views_tenant ON saved_views TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
