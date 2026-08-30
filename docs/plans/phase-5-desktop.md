# Phase 5e — Desktop wrapper (removed)

The Electron wrapper shipped, then was **removed**. Dira is the Vite web app at http://localhost:5181. This file is the original spec only.

Fifth later slice of [phase-5-later.md](./phase-5-later.md). Copilot is done. Do not pull in Tauri, mobile, Redis, S3, E2E encryption, or installers.

## Decision

**Electron** wraps the existing Vite app. Same IndexedDB, same API (`localhost:4006`), same `/sync`. This is a Chromium window with its own userData profile — not a second editor, not an embedded server.

## Goal

A native window opens Dira. Login and editing work like the browser. Local page bodies persist in Electron’s profile after the window closes.

## User-visible outcome

- `npm run desktop` in `dira_web` (Vite + API already running). Optional `DIRA_DESKTOP_DEBUG=9223` exposes Chromium DevTools Protocol for this process only.
- Window title **Dira**; topbar shows **Desktop**
- External links open in the system browser
- No Node in the renderer (`contextIsolation`, no `nodeIntegration`)

## Work

- `electron/main.mjs` + `electron/preload.cjs` (CommonJS: sandboxed preload cannot be ESM)
- Load `DIRA_DESKTOP_URL` or `http://localhost:5181`
- Remember window bounds in `userData`
- Preload exposes only `{ isDesktop: true }`
- `desktop` script runs `env -u ELECTRON_RUN_AS_NODE electron .` so Cursor/VS Code do not force the binary into Node mode

## Data model

Unchanged. Catalog still comes from the API; CRDT bodies stay in IndexedDB under Electron’s userData.

## Acceptance checks

- Electron window loads the Dira login or workspace UI (not a blank/error page)
- After login, the editor mounts; IndexedDB keys are still `dira:{workspaceId}:{pageId}`
- Close and reopen the window: session/local pages are still there (same profile)
- Browser and desktop can both talk to the same API; they do not share IndexedDB

## Not in this slice

- Bundled installer / auto-update / code signing
- Shipping a local Postgres or in-process API
- `file://` production pack (keep loading the Vite origin)
- Tauri, mobile, Redis, S3, E2E encryption

## Related

- Backlog: [phase-5-later.md](./phase-5-later.md)
- Editor: [phase-1-local-editor.md](./phase-1-local-editor.md)
