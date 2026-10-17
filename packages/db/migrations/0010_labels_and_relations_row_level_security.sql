-- Row-level security and grants for labels and relations, as in
-- 0004_row_level_security.sql.

GRANT SELECT, INSERT, UPDATE, DELETE ON labels TO edict_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON issue_labels, issue_relations TO edict_app;
--> statement-breakpoint

ALTER TABLE labels ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY labels_tenant ON labels TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
--> statement-breakpoint

ALTER TABLE issue_labels ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY issue_labels_tenant ON issue_labels TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
--> statement-breakpoint

ALTER TABLE issue_relations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY issue_relations_tenant ON issue_relations TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
