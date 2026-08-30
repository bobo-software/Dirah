# Phase 5g — Full-text search

Next item on [backlog.md](./backlog.md). Mobile readers are done. Do not pull in embeddings, “ask the workspace,” follow-a-user, or Redis.

## Decision

Index **plain text extracted from the page Y.Doc** into Postgres. Search stays `GET /api/workspaces/:id/pages?q=` — titles still match with `ILIKE`; body text matches with `tsvector`. No new product UI besides the existing search box. No pgvector.

## Goal

A unique word typed in a page body is findable from the workspace search box after sync, without renaming the page.

## User-visible outcome

- Sidebar search placeholder: **Search titles and text**
- Query matches live (non-trashed) pages in this workspace by title **or** body
- Other workspaces are not searched
- Viewers may search
- Pages that have never been synced have empty body index (title search still works)

## Backend work

- `pages.search_text` (plain extract) + generated `pages.search_tsv` (`to_tsvector` over title + body)
- GIN index on `search_tsv`
- On each authorized `push`, merge snapshot + updates, extract Y.Text from the `blocks` map, store `search_text`
- `?q=` → `title ILIKE` **OR** `search_tsv @@ plainto_tsquery('english', q)`
- Indexing must not fail the push (log and continue)

## Web work

- Same search input; change placeholder copy only

## Data model

```text
pages
  search_text  text not null default ''
  search_tsv   tsvector generated from title + search_text, stored
```

CRDT body unchanged.

## Acceptance checks

- Push a Y.Doc whose body contains a unique token; `?q=` that token returns the page; a different workspace does not
- Existing title search (`Parent Alpha`) still returns one page
- Viewer can search
- Trashed pages stay out of the default list
- Browser: type a unique word in the editor; search box finds that page; the tree is a flat match list while querying

## Not in this slice

- Snippets / highlighting
- Backfill job for historical docs (they index on the next push)
- Embeddings / pgvector / ask the workspace
- Searching trash, comments, or blob filenames

## Related

- Backlog: [backlog.md](./backlog.md)
- Title-only search: [phase-4-workspace-ux.md](./phase-4-workspace-ux.md)
