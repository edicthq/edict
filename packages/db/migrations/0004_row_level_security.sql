-- Row-level security for tenant tables (ADR 0006, ADR 0016).
--
-- The data-access layer (src/scope.ts) runs every tenant query in a transaction
-- that switches to the edict_app role and sets edict.org_id, edict.user_id and
-- edict.invite_token_hash as transaction-local settings. The policies below
-- read those settings. The connecting role owns the tables and bypasses RLS;
-- only migrations and Better Auth use it directly.

CREATE FUNCTION edict_org_id() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('edict.org_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION edict_user_id() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('edict.user_id', true), '') $$;
--> statement-breakpoint
CREATE FUNCTION edict_invite_token_hash() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('edict.invite_token_hash', true), '') $$;
--> statement-breakpoint

-- Roles are cluster-wide, so another Edict database in the same cluster may
-- have created it already, possibly at this very moment.
DO $$ BEGIN
  CREATE ROLE edict_app NOLOGIN;
EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
END $$;
--> statement-breakpoint
-- A superuser can switch to any role. Anyone else needs membership.
DO $$ BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
     AND NOT pg_has_role(current_user, 'edict_app', 'MEMBER') THEN
    EXECUTE format('GRANT edict_app TO %I', current_user);
  END IF;
END $$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO edict_app;
--> statement-breakpoint
GRANT SELECT (id, name, email) ON "user" TO edict_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON organizations, members, teams, invites TO edict_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON team_members TO edict_app;
--> statement-breakpoint
-- Append-only.
GRANT SELECT, INSERT ON events TO edict_app;
--> statement-breakpoint

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Visible inside its own scope, and to its members when they list their
-- organizations. Created by setting edict.org_id to the new id first.
CREATE POLICY organizations_select ON organizations FOR SELECT TO edict_app
  USING (
    id = edict_org_id()
    OR EXISTS (
      SELECT 1 FROM members m
      WHERE m.org_id = organizations.id
        AND m.user_id = edict_user_id()
        AND m.removed_at IS NULL
    )
  );
--> statement-breakpoint
CREATE POLICY organizations_insert ON organizations FOR INSERT TO edict_app
  WITH CHECK (id = edict_org_id());
--> statement-breakpoint
CREATE POLICY organizations_update ON organizations FOR UPDATE TO edict_app
  USING (id = edict_org_id());
--> statement-breakpoint

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- A user's own member rows are readable from any scope: that is how they list
-- their organizations.
CREATE POLICY members_tenant ON members TO edict_app
  USING (org_id = edict_org_id() OR user_id = edict_user_id())
  WITH CHECK (org_id = edict_org_id());
--> statement-breakpoint

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY teams_tenant ON teams TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
--> statement-breakpoint

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY team_members_tenant ON team_members TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
--> statement-breakpoint

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- An invite link's holder is not a member yet, so the invite is also readable
-- by its token hash.
CREATE POLICY invites_tenant ON invites TO edict_app
  USING (org_id = edict_org_id() OR token_hash = edict_invite_token_hash())
  WITH CHECK (org_id = edict_org_id());
--> statement-breakpoint

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY events_tenant ON events TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
