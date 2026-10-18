-- Row-level security and grants for webhooks (ADR 0022), as in
-- 0004_row_level_security.sql. The dispatcher and the delivery job work in
-- each organization's scope like any other write.

GRANT SELECT, INSERT, UPDATE, DELETE ON webhooks, webhook_deliveries TO edict_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_outbox TO edict_app;
--> statement-breakpoint

ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY webhooks_tenant ON webhooks TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
--> statement-breakpoint
ALTER TABLE webhook_outbox ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY webhook_outbox_tenant ON webhook_outbox TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
--> statement-breakpoint
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY webhook_deliveries_tenant ON webhook_deliveries TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
