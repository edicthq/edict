-- What the data-access layer may do with Better Auth's OAuth provider tables
-- (ADR 0021). Better Auth itself connects as the owning role and bypasses
-- these policies. Edict reads an access token by its hash to find the caller,
-- and pausing a connected agent deletes its grants in its organization: each
-- grant's reference_id is the organization the human chose to connect.

CREATE FUNCTION edict_oauth_token_hash() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('edict.oauth_token_hash', true), '') $$;
--> statement-breakpoint

GRANT SELECT, DELETE ON oauth_access_token, oauth_refresh_token, oauth_consent TO edict_app;
--> statement-breakpoint
-- A client's name is what its connected agent is called after.
GRANT SELECT (client_id, name) ON oauth_client TO edict_app;
--> statement-breakpoint
GRANT SELECT (id, user_id, oauth_org_id) ON session TO edict_app;
--> statement-breakpoint
GRANT UPDATE (oauth_org_id, updated_at) ON session TO edict_app;
--> statement-breakpoint

ALTER TABLE oauth_access_token ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY oauth_access_token_select ON oauth_access_token FOR SELECT TO edict_app
  USING (reference_id = edict_org_id()::text OR token = edict_oauth_token_hash());
--> statement-breakpoint
CREATE POLICY oauth_access_token_delete ON oauth_access_token FOR DELETE TO edict_app
  USING (reference_id = edict_org_id()::text);
--> statement-breakpoint

ALTER TABLE oauth_refresh_token ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY oauth_refresh_token_tenant ON oauth_refresh_token FOR ALL TO edict_app
  USING (reference_id = edict_org_id()::text);
--> statement-breakpoint

ALTER TABLE oauth_consent ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY oauth_consent_tenant ON oauth_consent FOR ALL TO edict_app
  USING (reference_id = edict_org_id()::text);
--> statement-breakpoint

-- Each user sets the organization on their own sessions only.
ALTER TABLE session ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY session_own ON session FOR ALL TO edict_app
  USING (user_id = edict_user_id());
