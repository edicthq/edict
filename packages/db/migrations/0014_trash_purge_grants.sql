-- The trash purge (ADR 0019) removes issues 30 days after deletion, under the
-- same row-level security as every other write. Comments already have DELETE.

GRANT DELETE ON issues TO edict_app;
