# Phase 5h — Follow a user

Next item on [backlog.md](./backlog.md) when this was written. Full-text search is done. Do not pull in workspace-wide presence, Redis, or snapshot history.

## Decision

**Follow** is a local camera: the current tab scrolls (page) or pans (board) to another client’s existing awareness selection. No new protocol, no Postgres. Stop when the user clicks **Following**, the peer leaves, or this tab changes page.

## Goal

Two people on the same page: A clicks **Follow** next to B in **On this page**. A’s viewport stays on B’s caret or board selection as B moves.

## User-visible outcome

- Remote rows in **On this page** get **Follow**
- While following: the button reads **Following** (click to stop)
- Page mode: the followed block scrolls into view
- Board mode: the followed shape/note is centered (switch Page ↔ Board if the other person’s selection is on the other surface)
- You cannot follow yourself
- Public `/s/:token` has no follow control (no workspace presence list)

## Work

- Parse `selectionV2` from the peer’s awareness state (`blockId` / `type: surface` + `elements`)
- `MountedPageEditor.follow(clientId)`
- Sidebar buttons; clear follow on page change

## Data model

Unchanged. Awareness stays ephemeral.

## Acceptance checks

- Two owner tabs, same page: Follow on tab A tracks B’s caret as B types further down the page
- On Board, Follow centers B’s selected shape
- Stop: **Following** again, or B closes the tab
- Viewer can Follow an editor

## Not in this slice

- Workspace-wide “who is online”
- Persistent follow, avatars, Redis
- Public-share follow
- Snapshot history, workspace databases

## Related

- Awareness: [phase-5-awareness.md](./phase-5-awareness.md)
- Backlog: [backlog.md](./backlog.md)
