# Server-authoritative API with a local client cache, no sync engine

Linear's speed comes from a local-first sync engine. We get most of that feel differently. The server is the source of truth, the client loads a team's open issues into TanStack DB collections, mutations apply optimistically, and WebSocket events patch the collections. A sync engine (Zero, ElectricSQL or a custom one) would add offline mode but also more services for self-hosters and a second data path next to the API that agents use. One API for every client won.

## Consequences

No offline mode. Very large teams page closed and archived issues from the server instead of holding everything locally.
