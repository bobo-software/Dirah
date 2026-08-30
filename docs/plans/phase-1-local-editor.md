# Phase 1 — Local page editor

A usable AFFiNE-like **page** experience on one device. No server sync.

## Goal

Inside a workspace, the user creates pages and edits them with BlockSuite. Content survives refresh via IndexedDB. The API only stores **page catalog** metadata (title, parent, order), not the document body.

## User-visible outcome

- Sidebar: page list, new page, rename, delete (local + catalog)
- Main: BlockSuite page editor (paragraphs, headings, lists, code at minimum)
- Switching pages loads the correct Y.Doc
- Offline / kill tab / reopen: pages and content still there
- Empty workspace: clear CTA to create the first page

## Backend work

- `pages` table + REST:
  - `GET /api/workspaces/:id/pages`
  - `POST /api/workspaces/:id/pages` `{ title?, parentId? }`
  - `PATCH /api/pages/:id` `{ title, parentId, position }`
  - `DELETE /api/pages/:id` (hard delete is OK; trash is phase 4)
- Authorize: caller must be `owner` of the workspace (only role that exists)
- **Do not** accept or return Yjs updates

If the API is unreachable, the web app may still create **local-only** pages and reconcile catalog on next successful request. Document that behavior; a simple v1 is: **catalog requires API**, body is local (user must be online to create a page id, then can edit offline). Prefer generating page ids as UUIDs client-side and upserting the catalog when online.

## Web work

- Layout: sidebar + editor pane; routes `/w/:workspaceId` and `/w/:workspaceId/p/:pageId`
- `src/editor/`: create/load Y.Doc, persist with IndexedDB, mount `PageEditor`
- IndexedDB key: `dira:{workspaceId}:{pageId}`
- Title in the sidebar: from catalog; optionally mirror title from BlockSuite doc title if the preset exposes it — keep catalog title as what the list shows
- Remove Vite starter UI from the authenticated app

Pin BlockSuite versions. Wrap imports so a preset rename does not scatter through the app.

## Data model

**Postgres**

```text
pages
  id            uuid pk
  workspace_id  fk
  title         text
  parent_id     uuid null  -- unused nesting until phase 4; allow null
  position      int        -- list order
  created_at, updated_at
```

**IndexedDB**

- Yjs update(s) / encoded Y.Doc per page

**Still absent:** `doc_updates`, blobs table (images in the editor may use in-memory or IDB blobs; they will not sync in phase 2 unless rewritten — acceptable).

## Acceptance checks

- Create three pages, edit text in each, refresh: list and bodies match
- Browser offline (after pages exist): editor still types and persists; reconnect does not wipe content
- Delete page: gone from list and from IndexedDB
- User A’s IndexedDB is not required for User B on another browser (bodies are local; that is expected)
- Unauthorized page create is 401; other user’s workspace is 403
- No WebSocket connection is opened

## Not in this phase

- Sync, snapshots, awareness cursors
- Image upload to the server
- Share links, invites
- Nested tree UI (parent_id may exist but show a flat list)
- Trash, search, markdown export
- Edgeless editor

## Related

- Previous: [phase-0-foundation.md](./phase-0-foundation.md)
- Next: [phase-2-sync.md](./phase-2-sync.md)
