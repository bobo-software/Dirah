# Phase 5i — Workspace collection

Next item on [backlog.md](./backlog.md) when this was written. Follow is done. Do not pull in custom property types, linked in-page databases, snapshot history, or Redis.

## Decision

Collection views are over the **page catalog** (SQL), not BlockSuite `affine:database` and not a Yjs walk of every doc. Each live page has one `status` (`''` | `todo` | `doing` | `done`). `/w/:workspaceId/collection` shows those pages as a table or a kanban. In-page Table/Kanban on a note is unchanged.

SQL is the right store: a collection must list every page without opening every Y.Doc.

## Goal

A member can see all live pages in one table or kanban and set a status that survives refresh.

## User-visible outcome

- Sidebar **Collection** (next to Trash)
- Table: title (opens the page) and status
- Kanban: columns **None / To do / Doing / Done**
- Editors change status; viewers see it read-only
- Trashed pages are not in the collection
- Public `/s/:token` has no Collection chrome

## Work

- `pages.status` text, default `''`, check constraint
- `PATCH /api/pages/:id` accepts `status`
- `PublicPage.status` on list/create/patch
- Collection route + Table/Kanban toggle (`?view=kanban`)

## Data model

```
pages.status  text not null default ''   -- '', todo, doing, done
```

Title, parent, favorites, search_text, and in-page `affine:database` stay as they are.

## Acceptance checks

- Owner opens Collection, sets a page to **Doing**; refresh still shows Doing
- Kanban puts that page in the Doing column
- Viewer can open Collection; they cannot change status
- Sidebar tree and in-page Table/Kanban are unchanged
- Trashed pages do not appear

## Not in this slice

- Arbitrary properties, tags, dates, formulas
- Linked databases / embedding a catalog inside a page
- Saved filters, drag between kanban columns
- Snapshot history, Redis, embeddings

## Related

- In-page databases: [phase-5-database.md](./phase-5-database.md)
- Backlog: [backlog.md](./backlog.md)
