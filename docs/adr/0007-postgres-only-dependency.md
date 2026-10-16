# Postgres is the only required dependency

Self-hosting is one app image plus Postgres. Jobs run on pg-boss, realtime fans out across instances with `LISTEN/NOTIFY`, search uses Postgres full-text search with `pg_trgm`, and attachments default to local disk. Redis and S3 are optional and only matter at scale. Every extra container means fewer people get Edict running, and each of these Postgres features is good enough at the size most teams run.
