# Phase 4 — Workspace UX

Make the core clone feel like a workspace, not a single flat editor demo.

## Goal

Pages nest, come back from trash, are findable by title, can be favorited, and can be exported as markdown. Optional: restore a previous snapshot.

## User-visible outcome

- Sidebar is a **tree** (indent, drag or move-to-parent)
- Delete → Trash view → Restore or permanently delete
- Search box: filter pages by title in the current workspace
- Favorite star; favorites section at top of sidebar
- Export current page as `.md`
- Optional: “History” list of snapshots, restore one (read-only preview first is OK)

## Backend work

- Use `pages.parent_id` + `position` for tree; cycle detection on move
- `deleted_at` on `pages` (and do not join sync for trashed pages unless restoring)
- `GET /api/workspaces/:id/pages?trashed=1`
- `POST /api/pages/:id/restore`
- Hard delete: drop catalog row, `doc_updates`, snapshots, local client must drop IDB
- `GET /api/workspaces/:id/pages?q=` title `ILIKE`
- `page_favorites` table or a boolean — table is cleaner for multi-device
- Export: server may extract plaintext from a Yjs snapshot **or** client exports from the live Y.Doc (client export is enough for v1)
- Optional history: list `doc_snapshots`, `POST /api/pages/:id/restore-snapshot`

## Web work

- Tree UI, trash route `/w/:id/trash`
- Search input
- Favorites
- Export button
- After restore, reopen Y.Doc from server (phase 2 join)

## Data model

```text
pages
  parent_id   uuid null
  position    int
  deleted_at  timestamptz null

page_favorites
  user_id, page_id, created_at
  primary key (user_id, page_id)
```

Y.Doc body unchanged. Trash is metadata.

## Acceptance checks

- Nest page B under A; refresh; order and parent persist
- Trash a nested page; children policy documented and tested (either cascade trash or block delete) — **prefer cascade trash**
- Restore returns the page to the tree and sync live
- Title search finds a page; does not search other workspaces
- Favorite shows on another browser for the same user (SQL, not IDB)
- Markdown export contains headings/lists from the current page
- Viewer cannot trash or export-admin if we treat export as read (viewers **may** export)

## Not in this phase

- Full-text search inside blocks
- Templates gallery
- Graph view / backlinks
- Multi-select move
- Edgeless, databases, AI
- Desktop app

## Related

- Previous: [phase-3-sharing.md](./phase-3-sharing.md)
- Backlog: [phase-5-later.md](./phase-5-later.md)
