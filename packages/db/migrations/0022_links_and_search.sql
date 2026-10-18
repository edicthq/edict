-- Row-level security for links, as in 0004_row_level_security.sql, and
-- search over issues (ADR 0007): full-text search on the title and
-- description, and trigrams on the title for parts of words.

GRANT SELECT, INSERT, DELETE ON issue_links TO edict_app;
--> statement-breakpoint
ALTER TABLE issue_links ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY issue_links_tenant ON issue_links TO edict_app
  USING (org_id = edict_org_id())
  WITH CHECK (org_id = edict_org_id());
--> statement-breakpoint

-- pg_trgm is a trusted extension, so the database owner can create it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- Kept out of the Drizzle schema, so selecting issues never fetches it. The
-- API reads it through sql fragments (issue search in search.ts).
ALTER TABLE issues ADD COLUMN search tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', description), 'B')
) STORED;
--> statement-breakpoint
CREATE INDEX issues_search_idx ON issues USING gin (search);
--> statement-breakpoint
CREATE INDEX issues_title_trgm_idx ON issues USING gin (title gin_trgm_ops);
