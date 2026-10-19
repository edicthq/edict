ALTER TYPE "public"."sign_up_mode" ADD VALUE 'domain';--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "join_domain" text;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "sign_up_domains" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
-- A user can see the organizations their verified address's domain may
-- join, before they are a member (scope.ts, joinDomain).
DROP POLICY organizations_select ON organizations;
--> statement-breakpoint
CREATE POLICY organizations_select ON organizations FOR SELECT TO edict_app
  USING (
    id = edict_org_id()
    OR EXISTS (
      SELECT 1 FROM members m
      WHERE m.org_id = organizations.id
        AND m.user_id = edict_user_id()
        AND m.removed_at IS NULL
    )
    OR join_domain = nullif(current_setting('edict.join_domain', true), '')
  );
