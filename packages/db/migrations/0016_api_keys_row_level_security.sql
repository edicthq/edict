-- Row-level security and grants for API keys (ADR 0021), as in
-- 0004_row_level_security.sql.

GRANT SELECT, INSERT, UPDATE ON api_keys TO edict_app;
--> statement-breakpoint

CREATE FUNCTION edict_api_key_hash() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('edict.api_key_hash', true), '') $$;
--> statement-breakpoint

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- The hash branch finds the key a request carries before its organization is
-- known, as invites-by-token do. Using the key still needs its organization.
CREATE POLICY api_keys_select ON api_keys FOR SELECT TO edict_app
  USING (org_id = edict_org_id() OR token_hash = edict_api_key_hash());
--> statement-breakpoint
CREATE POLICY api_keys_insert ON api_keys FOR INSERT TO edict_app
  WITH CHECK (org_id = edict_org_id());
--> statement-breakpoint
CREATE POLICY api_keys_update ON api_keys FOR UPDATE TO edict_app
  USING (org_id = edict_org_id());
