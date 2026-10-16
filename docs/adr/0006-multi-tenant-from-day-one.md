# Multi-tenant from day one

One instance can host many organizations, even though most self-hosters will run one. Every tenant-owned row carries `org_id`, a single data-access layer enforces it on every query, and Postgres row-level security backs that up. A future hosted version needs this, and retrofitting tenancy means touching every query and every index.
