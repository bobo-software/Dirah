# Phase 2 — Sync

The same page on two browsers (same user, then two users later in phase 3) converges via Yjs. Server is a replica, not the editor.

## Goal

Append Yjs updates in Postgres, replay them to clients over WebSocket, store file blobs. IndexedDB remains the fast local copy.

## User-visible outcome

- Two windows, same account, same page: typing in one appears in the other without reload
- New device after login: page list from API; opening a page fills from server updates then stays live
- Images inserted in the editor upload and survive on the other window
- Disconnect: local edits continue; reconnect: merge without duplicate-paragraph disasters (Yjs)

## Backend work

- Tables: `doc_updates`, `doc_snapshots` (optional but recommended after N updates), `blobs`
- REST:
  - `GET /api/pages/:id/updates?clock=` — fallback for clients that cannot WS yet
  - `POST /api/workspaces/:id/blobs` — upload; returns blob id + URL
  - `GET /api/blobs/:id` — download (authz: workspace member)
- WebSocket `/sync` (or Socket.io if already justified; prefer `ws` to stay light):
  - Authenticate (token in query or first message)
  - `join` workspace + doc
  - Diff by state vector / stored clock; send missing updates
  - `push` update → persist → broadcast
- Snapshot job: compact `doc_updates` into `doc_snapshots` so join stays fast
- Single-process broadcast is enough; no Redis pub/sub yet

## Web work

- `src/sync/`: connect after login, subscribe when a page is open, apply remote updates to the Y.Doc **before** echoing (standard Yjs provider pattern)
- Keep IndexedDB persistence **and** the network provider
- Replace local-only image insertion with blob upload; store blob ids in the doc
- Reconnect with backoff; show a simple “offline / syncing / live” indicator in the chrome

## Data model

```text
doc_updates
  id            bigserial
  workspace_id  uuid
  doc_id        uuid   -- pages.id
  update        bytea  -- Yjs update
  created_at    timestamptz

doc_snapshots
  doc_id        uuid pk
  snapshot      bytea
  update_clock  bigint  -- last doc_updates.id included
  created_at    timestamptz

blobs
  id            uuid
  workspace_id  uuid
  content_hash  text
  mime          text
  byte_size     int
  storage_key   text
  created_at    timestamptz
```

Join path: snapshot (if any) + `doc_updates` where `id > update_clock`.

## Acceptance checks

- Two browsers, same user: concurrent edits on one page converge to the same visible text
- Kill WS, edit, restore network: both sides match
- New browser profile, login, open page: content matches (not empty)
- Upload an image, open on second window: image loads
- Non-member cannot `join` another workspace’s doc (403 / disconnect)
- `pg_table_stats` on `doc_updates` grows while editing; snapshots appear after compaction threshold
- MCP is unused by the product path (still fine for debugging)

## Not in this phase

- Invites, viewer role, public links (still owner-only membership)
- Cursor / presence UI (awareness protocol may exist internally; do not ship avatars)
- History UI / time travel
- Multi-instance WS (Redis)
- Edgeless
- Encrypting docs at rest

## Related

- Previous: [phase-1-local-editor.md](./phase-1-local-editor.md)
- Next: [phase-3-sharing.md](./phase-3-sharing.md)
