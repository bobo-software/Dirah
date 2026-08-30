# 00 — Vision

Dira is a **local-first knowledge workspace**: people write in pages, organize them in workspaces, and keep working when the network is gone. Sync and sharing come after the editor feels like a real product.

It is **inspired by AFFiNE** (docs + workspace + eventual canvas), not a source fork.

## Product promise

A signed-in user can:

1. Own one or more workspaces
2. Create pages and edit them as blocks (paragraphs, headings, lists, code, images)
3. Keep those pages on the device (IndexedDB) so refresh and offline still work
4. Later: sync the same pages to the server and share them with others

The signature AFFiNE feeling we *do* chase in the core clone: **one workspace of pages, edited as blocks, that survive offline**. The signature we *defer*: merging those pages onto an infinite whiteboard.

## In scope (phases 0–4)

- Accounts and sessions
- Workspaces as the top-level container
- Page list and a BlockSuite page editor
- Yjs as the document body (not JSON blobs of blocks in Postgres)
- Sync of CRDT updates and file blobs
- Member roles and public share links
- Basic workspace UX: nesting, trash, title search, favorites, markdown export

## Out of scope until phase 5

- Edgeless / whiteboard UI (even though BlockSuite ships `EdgelessEditor`)
- Database blocks as a product surface (linked databases, kanban, etc.)
- AI / copilot
- Electron, iOS, Android
- Payments, public cloud multi-tenant billing
- Full-text search across block content (title search is phase 4)

## What we are not doing

**Not a pixel clone.** Dira’s chrome (sidebar, settings, empty states) is original. Do not lift AFFiNE CSS, assets, or React trees.

**Not a Nest/GraphQL rewrite.** AFFiNE’s server is Nest + Prisma + GraphQL + Socket.io. Dira already has Express + Drizzle + Postgres + JWT. Map the *ideas* (metadata in SQL, CRDT on the wire, blobs on disk/S3) onto that stack.

**Not vendoring AFFiNE.** AFFiNE is MPL-2.0. We implement Dira ourselves. We **may** depend on BlockSuite and Yjs as libraries (BlockSuite is to AFFiNE as Monaco is to VS Code).

## Success for the core clone

A small team can self-host Dira, create a workspace, write pages that work offline, invite a teammate, and see concurrent edits merge without a lock. Canvas, databases, and AI are optional later — not required to call the core clone done.

## Related

- Architecture: [01-architecture.md](./01-architecture.md)
- First build slice: [phase-0-foundation.md](./phase-0-foundation.md)
