# Phase 5a — Edgeless / whiteboard

First product slice of [phase-5-later.md](./phase-5-later.md). Phases 0–4 are done. Do not pull in databases, AI, desktop, or awareness cursors.

## Goal

The same page can be edited as a document **or** as a canvas. One Y.Doc, existing sync.

## User-visible outcome

- Toolbar: **Page** | **Board**
- Board is BlockSuite edgeless (select, shapes, connectors, sticky notes, pan/zoom — whatever the preset ships)
- Switching modes does not create a second document or drop local/server state
- Refresh and a second tab keep canvas objects
- Viewers can open Board read-only
- Markdown export stays on the page notes (shapes are not markdown)

## Backend work

None. Catalog, `doc_updates`, blobs, and `/sync` already carry the surface block. Do not add a `mode` column; persist view in the client (URL and/or localStorage).

## Web work

- `AffineEditorContainer.mode = 'edgeless'` on the mounted editor (same collection/doc as page mode)
- Toggle without remounting IndexedDB / WebSocket
- CSS: edgeless viewport fills the editor pane
- Public `/s/:token` can switch to Board, still read-only

## Data model

Unchanged. `affine:surface` is already seeded with empty pages.

## Acceptance checks

- Switch Page → Board → Page; typed text is still there
- Draw a shape (or sticky); refresh; it is still on the board
- Second tab, same account: the shape appears without reload
- Viewer can open Board and cannot edit
- Markdown export still downloads headings/lists from page notes

## Not in this slice

- Database / kanban views
- Copilot / AI
- Remote cursors / following
- Electron, S3, E2E encryption
- Frames-as-linked-pages product UI beyond what BlockSuite already does

## Related

- Backlog: [phase-5-later.md](./phase-5-later.md)
- Sync: [phase-2-sync.md](./phase-2-sync.md)
