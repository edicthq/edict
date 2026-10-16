# Optimistic versioning instead of real-time co-editing

Every write carries the version it started from. A stale write from a human opens a merge view, and a stale write from an agent gets `409 Conflict` and must re-read. Real-time co-editing with a CRDT such as Yjs would fight markdown as the stored format and add a second sync channel. MCP tools steer agents toward comments and progress updates instead of rewriting descriptions, which keeps conflicts rare.
