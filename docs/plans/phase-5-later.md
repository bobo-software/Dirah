# Phase 5 — Later (explicit backlog)

Do not start this until phases 0–4 meet their acceptance checks. This is the AFFiNE surface we **intentionally skipped** for the core clone.

## Edgeless / whiteboard

- Mount BlockSuite `EdgelessEditor` on the same Y.Doc (or a linked doc) so frames on the canvas are pages
- Tools: select, shapes, connectors, sticky notes, pan/zoom
- Sync already exists; treat this as UI + block schema, not a new storage system
- **Dependency:** phase 2 sync must be boringly reliable first

## Databases

- Collection views (table, kanban) over page properties
- Properties as Yjs maps or a SQL index built from docs — decide when we get here
- Not the same as Postgres tables for the Dira product itself

## Awareness polish

- Remote cursors, names, following a user
- Idle presence in the sidebar
- Protocol may already be on the WS; this is product UI

## AI

- Optional copilot on selection / page
- Separate provider keys; never required for editing
- AFFiNE-style “ask the workspace” needs an index (embeddings / pgvector) — only after search exists

## Platform

- Mobile readers
- S3 for blobs (shipped: [phase-5-blobs.md](./phase-5-blobs.md))
- E2E encryption of updates (shipped: [phase-5-e2e.md](./phase-5-e2e.md))
- Email invites (shipped: [phase-5-invites.md](./phase-5-invites.md)), Google / GitHub OAuth (shipped: [phase-5-oauth.md](./phase-5-oauth.md)), enterprise SAML / company OIDC
- Full-text search (extract text from Y.Doc into Postgres `tsvector` or an external index)

## What not to do even later without a decision

- Rewrite the API in Nest/GraphQL to “match AFFiNE”
- Vendor AFFiNE frontend packages
- Pixel-clone their marketing UI
- Desktop wrapper (Electron / Tauri)

## When a later item moves up, give it its own file with the same structure as phases 0–4, and check it off [backlog.md](./backlog.md).

**Active later slice:** next is Ask the workspace ([backlog.md](./backlog.md)). Native iOS / Android is parked. Shipped: [phase-5-edgeless.md](./phase-5-edgeless.md), [phase-5-database.md](./phase-5-database.md), [phase-5-awareness.md](./phase-5-awareness.md), [phase-5-ai.md](./phase-5-ai.md), [phase-5-mobile.md](./phase-5-mobile.md), [phase-5-search.md](./phase-5-search.md), [phase-5-follow.md](./phase-5-follow.md), [phase-5-collection.md](./phase-5-collection.md), [phase-5-history.md](./phase-5-history.md), [phase-5-redis.md](./phase-5-redis.md), [phase-5-blobs.md](./phase-5-blobs.md), [phase-5-e2e.md](./phase-5-e2e.md), [phase-5-invites.md](./phase-5-invites.md), [phase-5-oauth.md](./phase-5-oauth.md). [phase-5-desktop.md](./phase-5-desktop.md) shipped then was removed.

## Related

- Core clone ends at [phase-4-workspace-ux.md](./phase-4-workspace-ux.md)
- Why we wait: [00-vision.md](./00-vision.md)
