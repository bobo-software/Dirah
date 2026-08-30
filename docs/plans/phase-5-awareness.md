# Phase 5c — Awareness polish

Third later slice of [phase-5-later.md](./phase-5-later.md). Edgeless and in-page databases are done. Do not pull in AI, desktop, or “follow this user” viewport locking.

## Decision

Presence is **Yjs awareness** on the same `/sync` WebSocket as document updates. It is **ephemeral** (in-memory relay only). No new Postgres tables. BlockSuite already paints remote carets from `user` + `selectionV2`; we only transport that CRDT and label people.

## Goal

Two people on the same page see each other’s caret (or board selection) with a name, and the workspace sidebar lists who is on the page (active vs idle).

## User-visible outcome

- Remote caret / selection uses the other person’s **email** (public links: **Guest**)
- Sidebar **On this page**: name + Active or Idle
- Idle = tab hidden, or no pointer/keyboard for 45s
- Viewers and public links may send awareness (not a document `push`)
- Disconnect removes them from the list and drops their caret

## Backend work

JSON messages on `/sync` after `join`:

- `awareness` — base64 `y-protocols` update + `clientId`; broadcast to the room; do not persist
- `awareness-query` — ask peers to resend (sent to existing sockets when someone joins)
- `awareness-leave` — server emits on socket close / room leave so peers can `removeAwarenessStates`

Anyone who can `join` can send `awareness`. `push` authz is unchanged.

## Web work

- Bind `DocCollection` awareness (not `spaceDoc`) in `SyncClient`
- Set local `user.name` before connecting
- Sidebar list from remote+local awareness states
- Keep BlockSuite’s existing remote-selection widgets

## Data model

Unchanged catalog. Awareness is not in `doc_updates`.

## Acceptance checks

- Two tabs, same page: each caret shows the other identity; sidebar lists both
- Hide a tab (or wait idle); the other tab shows Idle; activity returns to Active
- Close one tab; the other drops that person
- Viewer cannot `push` (already true) but their caret/name still appears for an editor

## Not in this slice

- Follow / jump-to-user camera
- Workspace-wide “who is online” without a page open
- Persist presence, Redis, avatars
- Copilot, Electron

## Related

- Backlog: [phase-5-later.md](./phase-5-later.md)
- Sync: [phase-2-sync.md](./phase-2-sync.md)
