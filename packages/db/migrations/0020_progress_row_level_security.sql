-- Row-level security and grants for progress updates, as in
-- 0004_row_level_security.sql. Progress updates are never edited.

GRANT SELECT, INSERT ON progress_updates TO edict_app;
--> statement-breakpoint

ALTER TABLE progress_updates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY progress_updates_tenant ON progress_updates TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
