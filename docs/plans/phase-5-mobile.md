# Phase 5f — Mobile readers

First item on [backlog.md](./backlog.md). Copilot is done. Do not pull in native iOS/Android, installers, Redis, S3, or full-text search.

## Decision

The **same Vite app** should be readable on a phone. Sidebar becomes an off-canvas drawer; the editor and public share use the full width. This is not a second codebase and not an App Store app.

## Goal

Someone on a ~390px-wide viewport can sign in, open a workspace, pick a page, and read or edit it without the sidebar crushing the editor.

## User-visible outcome

- Below ~768px: **Pages** opens the workspace sidebar as a drawer; backdrop or Escape closes it
- Opening a page (or Trash) closes the drawer so the editor is full width
- Topbar does not overflow: hide the email on small screens (Log out and sync status stay)
- Public `/s/:token` remains a single column
- Desktop layout (sidebar always visible) is unchanged at ≥768px

## Work

- Drawer + backdrop in the workspace shell
- A **Pages** control visible only on small viewports
- CSS: single-column shell, wrapping editor toolbar, auth cards not flush to the screen edge
- No new API or tables

## Data model

Unchanged.

## Acceptance checks

- At ~390×844: login is usable; workspace shows the editor (or empty pane) full width; **Pages** reveals the tree; choosing a page closes the drawer and the editor is still there
- Public share at the same size shows the page body without a second column of chrome
- At ≥768px: sidebar stays a persistent column (no drawer required)

## Not in this slice

- Native iOS / Android
- Touch-specific BlockSuite toolbars
- Bottom navigation / a separate mobile IA
- Redis, S3, E2E encryption, search, installers

## Related

- Backlog: [backlog.md](./backlog.md)
- Phone layout vs a native shell: [phase-5-desktop.md](./phase-5-desktop.md) (wrapper removed)
