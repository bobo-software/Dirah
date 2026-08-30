# Dira product plans

Phased program to build Dira as a **local-first knowledge workspace** inspired by [AFFiNE](https://affine.pro/): workspaces, pages, a block editor, then sharing. Documents are Yjs CRDTs. Whiteboard, databases, and AI are later.

These files are the source of truth for *what to build next*. They are not implementation.

## Current phase

See **[PROGRESS.md](../PROGRESS.md)** for live status across sessions.

**Phase 5n — Email invites (no existing account) is implemented.** Remaining work: [backlog.md](./backlog.md).

## Reading order

1. [00-vision.md](./00-vision.md) — product, in-scope vs later, license
2. [01-architecture.md](./01-architecture.md) — BlockSuite + Yjs, data split, sync sketch
3. [phase-0-foundation.md](./phase-0-foundation.md) — users, auth, workspaces
4. [phase-1-local-editor.md](./phase-1-local-editor.md) — page editor, IndexedDB, offline
5. [phase-2-sync.md](./phase-2-sync.md) — Yjs update log, WebSocket, blobs
6. [phase-3-sharing.md](./phase-3-sharing.md) — members, roles, share links
7. [phase-4-workspace-ux.md](./phase-4-workspace-ux.md) — tree, trash, search, export
8. [phase-5-later.md](./phase-5-later.md) — explicit backlog
9. [phase-5-edgeless.md](./phase-5-edgeless.md) — whiteboard (first later slice)
10. [phase-5-database.md](./phase-5-database.md) — in-page table / kanban
11. [phase-5-awareness.md](./phase-5-awareness.md) — remote carets / presence
12. [phase-5-ai.md](./phase-5-ai.md) — optional page/selection copilot
13. [phase-5-desktop.md](./phase-5-desktop.md) — Electron window (removed; web only)
14. [phase-5-mobile.md](./phase-5-mobile.md) — phone-width web reader
15. [phase-5-search.md](./phase-5-search.md) — title + body full-text search
16. [phase-5-follow.md](./phase-5-follow.md) — follow another user’s caret / board selection
17. [phase-5-collection.md](./phase-5-collection.md) — workspace table / kanban over page status
18. [phase-5-history.md](./phase-5-history.md) — save / preview / restore page versions
19. [phase-5-redis.md](./phase-5-redis.md) — optional Redis fan-out for `/sync`
20. [phase-5-blobs.md](./phase-5-blobs.md) — optional MinIO/S3 blob bytes
21. [phase-5-e2e.md](./phase-5-e2e.md) — optional E2E encryption of Yjs updates
22. [phase-5-invites.md](./phase-5-invites.md) — email invites for people without an account
23. [backlog.md](./backlog.md) — remaining product work (ordered)

## Scope (core clone)

In scope across phases 0–4:

- Workspaces and membership
- Pages with a block editor
- Local-first editing (IndexedDB)
- Server sync of CRDT updates
- Sharing (roles + public links)

## Non-goals (until phase 5)

- Edgeless / whiteboard / canvas
- Databases / table views
- Copilot / AI
- Desktop (Electron) or mobile
- GraphQL, NestJS, or Prisma (stay on Express + Drizzle)
- Copying AFFiNE application source

## Stack we keep

| Layer | Choice |
|-------|--------|
| Web | Vite, React 19 (`dira_web`) |
| Editor | BlockSuite `PageEditor` + Yjs |
| API | Express, Drizzle, PostgreSQL (`dira_backend`) |
| Auth | JWT (helpers already in `src/utils/jwt.ts`) |
| Realtime | WebSocket (phase 2) |
| Agent access | Existing MCP `/mcp/protocol` |

## How to use these docs

When implementing a phase, treat that phase file as the spec: ship the acceptance checks, do not pull in “not in this phase” items. Update **Current phase** in this README when a phase is done.
