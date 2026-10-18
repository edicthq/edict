-- Row-level security and grant for inbox (ADR 0002, ADR 0006).
GRANT SELECT, INSERT, UPDATE, DELETE ON inbox TO edict_app;
--> statement-breakpoint

ALTER TABLE inbox ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY inbox_tenant ON inbox TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
