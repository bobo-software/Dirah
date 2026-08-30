# Phase 5b — In-page databases

Second later slice of [phase-5-later.md](./phase-5-later.md). Edgeless is done. Do not pull in workspace-wide page properties, AI, or desktop.

## Decision

Collection views live **inside the page Y.Doc** as BlockSuite `affine:database` (table and kanban). Columns and cells are Yjs maps on that block. **No new Postgres tables.** A catalog-wide “all pages as a database” is still later.

## Goal

A user can insert a table or kanban on a page, fill rows, and see it survive refresh and a second tab.

## User-visible outcome

- Toolbar: **Table** and **Kanban** (editors only; slash menu `/table` / `/kanban` also works)
- Rows are page-note children of the database block (BlockSuite default)
- Refresh and live sync keep the table
- Viewers see the table read-only
- Markdown export includes a GitHub-style table of titles and column values

## Backend work

None. Same `doc_updates` / `/sync` as any other block.

## Web work

- `insertDatabase('table' | 'kanban')` on the mounted editor via `DatabaseBlockService.initDatabaseBlock`
- Toolbar actions in page view
- Markdown walker for `affine:database`

## Data model

Unchanged catalog. Database props (`views`, `columns`, `cells`, `title`) stay in the CRDT.

## Acceptance checks

- Insert a table; add or edit a row; refresh; the row is still there
- Second tab, same account: the row appears without reload
- Kanban inserts and is visible
- Viewer cannot insert; they can see an existing table
- Export markdown contains a `|` table for the database

## Not in this slice

- Properties on the workspace page catalog / SQL index of page fields
- Linked databases across pages
- Copilot, awareness cursors, Electron

## Related

- Backlog: [phase-5-later.md](./phase-5-later.md)
- Board: [phase-5-edgeless.md](./phase-5-edgeless.md)
