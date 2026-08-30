# 01 — Architecture

How Dira maps AFFiNE’s local-first model onto the existing Express + Drizzle + Postgres + React stack.

## Principles

1. **The page body is a Y.Doc.** Postgres never stores a JSON tree of blocks as the source of truth.
2. **SQL holds metadata.** Users, workspaces, membership, page titles/tree, share links, blob keys, and an append-only log of Yjs updates.
3. **The client is the editor.** BlockSuite renders and mutates the Y.Doc. The server authenticates, authorizes, stores, and fans out updates.
4. **Offline first, then sync.** Phase 1 is fully usable with IndexedDB only. Phase 2 adds the server as another replica.
5. **Reuse Dira.** JWT helpers, MCP, Drizzle, and Vite/React stay. Do not introduce Nest, GraphQL, or Prisma.

## System sketch

```text
dira_web                         dira_backend
────────                         ────────────
App shell (React)                REST /api
  ├─ workspace switcher            ├─ auth (JWT)
  ├─ page tree                     ├─ workspaces, members
  └─ PageEditor (BlockSuite)       ├─ page metadata
         │                         └─ blob upload
         ▼
      Y.Doc                      WebSocket /sync
         │                         ├─ join workspace/doc room
         ├─ IndexedDB              ├─ push Yjs update
         └─ y-websocket-like       └─ awareness (phase 5 polish)
```

## Editor: BlockSuite + Yjs

Use BlockSuite’s **page** editor (web components) inside React, not a custom block renderer.

| Package | Role |
|---------|------|
| `@blocksuite/store` | Yjs-backed document store |
| `@blocksuite/presets` (or current BlockSuite page preset) | `PageEditor` |
| `yjs` | CRDT |
| `y-indexeddb` (or BlockSuite’s IDB adapter) | Local persistence |

**Phase 1** attaches the editor to a local Y.Doc and persists it. **Phase 2** also applies remote updates from the server.

Do **not** mount `EdgelessEditor` until [phase-5-later.md](./phase-5-later.md).

BlockSuite APIs move; pin versions and wrap the editor in a thin Dira adapter (`src/editor/`) so the rest of the app does not import BlockSuite internals everywhere.

## Data split

### Client (IndexedDB)

- One Y.Doc per page (`docId`)
- Optional workspace-level Y.Doc later for shared tree state; **phase 1–2 keep the page tree in SQL + client cache** to avoid a second CRDT until we need it
- Editor awareness state is ephemeral (not durable)

### Postgres (server)

Suggested tables (names can change in implementation; intent must not):

| Table | Holds |
|-------|--------|
| `users` | id, email, password hash, timestamps |
| `refresh_tokens` | hashed refresh tokens, expiry |
| `workspaces` | id, name, owner_id, timestamps |
| `workspace_members` | workspace_id, user_id, role |
| `pages` | id, workspace_id, title, parent_id, position, deleted_at, timestamps |
| `doc_updates` | id, workspace_id, doc_id, update (`bytea`), created_at |
| `doc_snapshots` | doc_id, snapshot (`bytea`), clock, created_at (phase 2+) |
| `blobs` | id, workspace_id, hash, mime, size, storage_key |
| `share_links` | token, workspace_id or page_id, permission, expiry (phase 3) |

**Rule:** `pages` is the catalog. `doc_updates` is the body. Never write block JSON into `pages`.

### Blobs

Images and attachments are **not** inside the Y.Doc as raw bytes. The Y.Doc stores blob IDs. Bytes go to local disk in dev (`uploads/`) and later S3-compatible storage. Phase 2 introduces upload + download URLs; phase 1 can use `blob:` URLs local to the browser only (they will not survive sync).

## Auth

Existing [`src/utils/jwt.ts`](../../src/utils/jwt.ts): 15-minute access token, 7-day refresh, payload `{ userId, profileId?, role? }`.

Phase 0 adds:

- `Authorization: Bearer` middleware that sets `req.user`
- Register / login / refresh / logout routes
- Password hashing (bcrypt or argon2)

Keep cookies optional; Bearer is enough for SPA + MCP-style clients.

## REST vs WebSocket

| Concern | Transport |
|---------|-----------|
| Auth, workspace CRUD, page catalog, blobs, share links | REST `/api/...` |
| Yjs updates, optional awareness | WebSocket `/sync` |

REST stays JSON envelopes via existing `ResponseUtils`. WebSocket messages are binary-friendly (Yjs updates are `Uint8Array`).

### Sync protocol (sketch for phase 2)

Server rooms: `workspace:{id}` and optionally `doc:{id}`.

Client after auth:

1. `join` `{ workspaceId, docId }`
2. Server replies with **missing updates** (or a snapshot + tail of updates) using Yjs state vectors
3. Client `push` `{ docId, update }`
4. Server appends `doc_updates`, broadcasts to other members in the room

Compatibility with `y-websocket` is desirable if it is a clean fit; a small Dira-specific protocol is fine. Do not take a dependency on AFFiNE’s Socket.io event names.

## Permissions (enforced from phase 3; owner-only until then)

| Role | Catalog | Push updates | Read updates |
|------|---------|--------------|--------------|
| owner | full | yes | yes |
| editor | create/rename pages | yes | yes |
| viewer | read | no | yes |
| share-link viewer | read that page/workspace | no | yes |

Until phase 3, every authenticated workspace operation requires `owner` (the creator). Sync must still check membership so a stolen doc id cannot attach to another workspace.

## Web app shape (`dira_web`)

Today: Vite starter in [`src/App.tsx`](../../../dira_web/src/App.tsx).

Target layout (phase 1+):

- `react-router` — `/login`, `/w/:workspaceId`, `/w/:workspaceId/p/:pageId`
- App shell — sidebar (page list), main (editor)
- Auth store — access token in memory, refresh token in `httpOnly` cookie **or** `localStorage` (pick one in phase 0 and document it)
- `src/editor/` — BlockSuite mount + Y.Doc lifecycle
- `src/sync/` — empty until phase 2

## Backend shape (`dira_backend`)

Keep `createApp()`, Drizzle, MCP mount at `/mcp/protocol`.

Add:

- `src/db/schemas/` — tables above
- `src/middlewares/auth.ts`
- `src/routes/` for auth, workspaces, pages, blobs
- `src/sync/` WebSocket gateway (phase 2)
- `scripts/migrate.ts` already exists for Drizzle

`docker-compose.yml` still ships leftover MySQL named `schoolos`. Phase 0 replaces it with Postgres matching `.env` (`DB_PORT=5432`). Redis is not required until we need pub/sub across multiple API processes (single-node WS is enough at first).

## How MCP helps

The Postgres MCP tools (`pg_select`, `pg_describe_table`, `pg_execute_write`, `pg_migration_status`) are for **agents and developers** inspecting Dira’s database while building phases 0–4. They are not the product API. Do not expose Yjs internals as MCP resources until we have a reason.

## Explicit non-architecture

- No GraphQL layer
- No Prisma
- No copying AFFiNE `nbstore` / `y-octo` — Yjs in TypeScript is enough
- No CRDT for the entire workspace catalog in v1 (SQL is simpler; we can CRDT the tree later if conflicts appear)

## Related

- Vision: [00-vision.md](./00-vision.md)
- Build order starts at [phase-0-foundation.md](./phase-0-foundation.md)
