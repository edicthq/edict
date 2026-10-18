-- Row-level security and grant for projects (ADR 0002, ADR 0006), as in
-- 0004_row_level_security.sql. A project is read and written in its
-- organization like any other tenant row.

GRANT SELECT, INSERT, UPDATE, DELETE ON projects TO edict_app;
--> statement-breakpoint

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY projects_tenant ON projects TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
