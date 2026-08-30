# Phase 5j — Page snapshot history

Next item on [backlog.md](./backlog.md) when this was written. Collection is done. Do not pull in Redis, S3, or named branches.

## Decision

Compaction stays one current row in `doc_snapshots` (join path unchanged). History is a new append-only `doc_revisions` table: each **Save version** (and each compaction) copies the merged Y.Doc. Restore **replaces** the live log with that revision (delete `doc_updates`, reset the current snapshot). The tab drops IndexedDB for the page and remounts. Not a CRDT merge-back.

## Goal

An editor can save a version, preview an older one as text, and restore it. The restored body is what they see after reload.

## User-visible outcome

- Toolbar **History** (members; public share has none)
- **Save version** (editors) stores the current synced body
- List of versions with time + text preview
- **Restore** (editors) confirms, then the editor reloads that body
- Viewers can open History and read previews; they cannot save or restore

## Work

- `doc_revisions` (`id`, `doc_id`, `snapshot`, `update_clock`, `created_at`); keep 50 per page
- `GET/POST /api/pages/:id/snapshots`, `GET .../:id`, `POST .../:id/restore`
- Compaction also appends a revision
- History panel; after restore, `deletePagePersistence` + remount

## Data model

```
doc_revisions
  id            bigserial pk
  doc_id        uuid → pages
  snapshot      bytea
  update_clock  bigint
  created_at    timestamptz
```

`doc_snapshots` (one current compact row per page) is unchanged.

## Acceptance checks

- Save version; list shows it; preview contains a unique word from the page
- Edit the page; save again; restore the first version; the unique word is back and the later edit is gone
- Viewer can list/preview; Save and Restore are 403
- Public `/s/:token` has no History

## Not in this slice

- Diff view, named labels, restore-as-copy
- Keeping updates after restore (hard reset of the log)
- Redis, S3, encryption

## Related

- Compaction: [phase-2-sync.md](./phase-2-sync.md)
- Optional leftover: [phase-4-workspace-ux.md](./phase-4-workspace-ux.md)
- Backlog: [backlog.md](./backlog.md)
