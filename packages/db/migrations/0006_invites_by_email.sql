-- Invite-only sign-up asks whether an email has an open invite in any
-- organization, before the user exists. Read-only: the scope can see those
-- invites but not change them.

CREATE FUNCTION edict_invite_email() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('edict.invite_email', true), '') $$;
--> statement-breakpoint
CREATE POLICY invites_by_email ON invites FOR SELECT TO edict_app
  USING (email = edict_invite_email());
