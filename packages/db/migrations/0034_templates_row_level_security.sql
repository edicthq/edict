-- Row-level security and grant for templates (ADR 0002, ADR 0006).
GRANT SELECT, INSERT, UPDATE, DELETE ON templates TO edict_app;
--> statement-breakpoint

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY templates_tenant ON templates TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
