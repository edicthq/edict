# One transactional event log feeds everything

Every change writes an append-only event in the same database transaction as the change. Issue history, realtime pushes, inbox notifications, webhook deliveries and the agent audit trail all read from that log, fanned out by pg-boss and Postgres `LISTEN/NOTIFY`. Separate code paths per consumer would drift, and "the UI saw it but the webhook never fired" is exactly the bug agent runners cannot tolerate.

## Consequences

Per-agent revert becomes a query over the log plus inverse operations, which is why it is cheap to add right after v1.
