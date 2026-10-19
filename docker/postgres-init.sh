#!/bin/sh
# Runs once, when the database volume is first created. Edict connects as its
# own role, which owns the database but is not a superuser, so row-level
# security (ADR 0006) holds for anything that slips past SET ROLE. It is a
# member of edict_app, the role queries run as (packages/db/src/scope.ts);
# roles are cluster-wide, so it is made here rather than by a migration that
# a non-superuser could not run where edict_app already exists.
#
# Postgres sources this file instead of running it when it is not executable,
# as after a download, so it sets no shell options: psql's failure is the
# script's, and the entrypoint stops on it either way.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
CREATE ROLE edict LOGIN PASSWORD '${EDICT_DB_PASSWORD:?EDICT_DB_PASSWORD is not set}';
DO \$\$ BEGIN
  CREATE ROLE edict_app NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END \$\$;
GRANT edict_app TO edict;
ALTER DATABASE "${POSTGRES_DB}" OWNER TO edict;
ALTER SCHEMA public OWNER TO edict;
EOSQL
