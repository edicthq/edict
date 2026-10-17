-- Row-level security and grants for the M2 issue tables, as in
-- 0004_row_level_security.sql, and the history and workflow rows that teams
-- created before M2 lack.

GRANT SELECT, INSERT ON team_keys, issue_numbers TO edict_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON statuses TO edict_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON issues TO edict_app;
--> statement-breakpoint

ALTER TABLE team_keys ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY team_keys_tenant ON team_keys TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
--> statement-breakpoint

ALTER TABLE statuses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY statuses_tenant ON statuses TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
--> statement-breakpoint

ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY issues_tenant ON issues TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
--> statement-breakpoint

ALTER TABLE issue_numbers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY issue_numbers_tenant ON issue_numbers TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
--> statement-breakpoint

INSERT INTO team_keys (org_id, key, team_id)
  SELECT org_id, key, id FROM teams;
--> statement-breakpoint

-- The same workflow new teams get (defaultStatuses in apps/server).
INSERT INTO statuses (org_id, team_id, name, category, position, is_default)
  SELECT t.org_id, t.id, s.name, s.category::status_category, s.position, s.is_default
  FROM teams t
  CROSS JOIN (VALUES
    ('Backlog', 'backlog', 0, false),
    ('Todo', 'todo', 0, true),
    ('In Progress', 'in_progress', 0, false),
    ('In Review', 'in_progress', 1, false),
    ('Done', 'done', 0, false),
    ('Canceled', 'canceled', 0, false)
  ) AS s(name, category, position, is_default);
