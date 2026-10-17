---
status: accepted
---

# Attachments live on local disk or S3, behind stable file paths in markdown

Postgres is the only required service ([ADR 0007](./0007-postgres-only-dependency.md)), so attachments go to a directory on local disk by default (`DATA_DIR`, a volume in the compose file) and to an S3-compatible bucket when `S3_BUCKET` and its credentials are set. One storage interface (put, get, delete) hides which one is in use. Postgres keeps a row per attachment with its organization, issue, file name, content type, size and checksum. Storage keys are `<org_id>/<attachment_id>`, so moving an issue or renaming a file never moves the object.

Uploads and downloads both go through the API, which checks that the caller can see the issue. Size is capped by `ATTACHMENT_MAX_BYTES`, 25 MB by default.

Descriptions and comments are markdown ([ADR 0009](./0009-markdown-is-canonical.md)), so they point at attachments by URL, and that URL is stored in the text forever. Markdown stores a relative path, `/files/<attachment_id>/<file name>`, that does not depend on the instance's public URL, the API version or the storage backend. The server answers that path after the same permission check. Agents read it as a normal link and fetch it with their token against the instance URL they already use.

## Considered options

- **Postgres large objects or `bytea`.** No extra configuration, but bloats backups and the database for every self-hoster.
- **Absolute URLs in markdown.** Break when an instance changes its domain.
- **Versioned API paths in markdown (`/api/v1/...`).** Would tie stored text to API v1 for good.
- **Direct uploads to S3 with presigned URLs.** Saves server bandwidth, but needs a second code path for local disk. Presigned downloads can be added later behind the same `/files` path.

## Consequences

- Several replicas need S3 or a shared volume. The self-hosting docs say so.
- Purging an issue from the trash deletes its files.
- The organization export writes each file next to the JSON and rewrites nothing, since the paths are relative.
