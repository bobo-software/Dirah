# Progress

Living status for Dira across chat sessions. **Update this file at the end of every session** (what landed, what is next, anything blocked). Specs stay in [plans/](./plans/); leftovers stay in [debt/](./debt/).

## Now

**Phase 5o — Google / GitHub OAuth is implemented.** Remaining product work is in [plans/backlog.md](./plans/backlog.md). Do not start the next item unless asked.

## Local run

| Process | Command | URL |
|---------|---------|-----|
| API | `cd dira_backend && npm run dev` | http://localhost:4006 |
| Web | `cd dira_web && npm run dev` | http://localhost:5181 |
| MCP | same API process | http://localhost:4006/mcp/protocol |
| Postgres | already running locally (`.env` user `postgres`); or `docker compose up` (user `dira` — see [debt/config.md](./debt/config.md)) | localhost:5432 |

Web `.env`: `VITE_API_URL=http://localhost:4006`. CORS: `http://localhost:5181`.

Coolify live is separate: API image `EXPOSE 4002`; web is nginx on **83**. Point the web build arg `VITE_API_URL` at the public API origin (`https://…`). The web Dockerfile prefixes `https://` if Coolify injects a hostname with no scheme.

From this repo root, `npm run dev` in `dira_web` can pick up the backend package if the shell cwd is wrong — run Vite via `dira_web/node_modules/.bin/vite` or `cd` there first.

## Done

- Postgres MCP server (`/mcp/protocol`, `pg_*` tools, Bearer `MCP_API_KEY`). Docs: [HOW_TO_BUILD_AN_MCP_SERVER.md](./HOW_TO_BUILD_AN_MCP_SERVER.md).
- Product plan pack: [plans/](./plans/) (vision, architecture, phases 0–5).
- Phase 0 API: users, refresh tokens, workspaces, JWT auth, auto-create “My workspace”.
- Phase 0 web: login, register, workspace list, shell.
- Phase 1 API: `pages` table, `GET/POST /api/workspaces/:id/pages`, `PATCH/DELETE /api/pages/:id`, owner 401/403. Migration `0001_phase1_pages`.
- Phase 1 web: sidebar catalog, `/w/:workspaceId/p/:pageId`, BlockSuite page editor, IndexedDB `dira:{workspaceId}:{pageId}`. Adapter in `src/editor/`. Catalog requires API; body is local.
- Phase 2 API: `doc_updates` / `doc_snapshots` / `blobs`, `GET /api/pages/:id/updates`, blob REST, WebSocket `/sync` (auth then join/push). Migration `0002_phase2_sync`. Blobs use text ids (BlockSuite SHA keys), files under `BLOB_DIR`.
- Phase 2 web: `SyncClient` + topbar `offline/syncing/live`, Y.Doc bound to `/sync`, `HttpBlobSource` as BlockSuite main blob store.
- Phase 3 API: `workspace_members.role` owner|editor|viewer, invite/remove/change role, `share_links`, `GET /api/public/pages/:token`, WS join for members + public view tokens, push only owner/editor. Migration `0003_phase3_sharing`.
- Phase 3 web: members panel, page share dialog, readonly editor for viewers, public `/s/:token` without workspace chrome.
- Phase 4 API: `pages.deleted_at`, cascade trash, restore, permanent delete, title `ILIKE` search, `page_favorites`, cycle detection on move. Migration `0004_phase4_workspace_ux`. Trashed pages 404 on sync join / share. Nested restore: children stay in trash until restored; if the parent is still trashed, the child comes back at the workspace root.
- Phase 4 web: nested page tree (indent + drag onto a parent or the Pages header), `/w/:id/trash`, title search, SQL favorites, client markdown export (viewers may export).
- Phase 5a web: Page/Board toggle on the same Y.Doc (`AffineEditorContainer` edgeless). View in `?view=edgeless` + localStorage. Viewers wait for sync instead of seeding an empty readonly doc.
- Phase 5b web: in-page BlockSuite `affine:database` (table / kanban) on the same Y.Doc. Toolbar Table/Kanban for editors; markdown export walks columns/cells. No new Postgres tables.
- Phase 5c: ephemeral Yjs awareness on `/sync` (`awareness` / `awareness-query` / `awareness-leave`). Remote carets use email (or Guest); sidebar **On this page** with Active/Idle. Viewers may send awareness; `push` authz unchanged. **40** backend tests.
- Phase 5d: optional **Ask** copilot. `GET /api/ai/status`, `POST /api/ai/pages/:id`. Enabled only with `AI_API_KEY` (OpenAI-compatible). No key → 503 `AI_UNAVAILABLE`; editing still works. Viewers may ask; only editors get Insert. No embeddings. **42** backend tests.
- Phase 5e: Electron window was added, then **removed**. Dira is the Vite web app at http://localhost:5181. No `npm run desktop`.
- Phase 5f: phone-width web reader. Below 768px the workspace sidebar is an off-canvas **Pages** drawer; public share stays one column. Desktop sidebar unchanged. Native iOS/Android not in this slice.
- Phase 5g: full-text search. `pages.search_text` + generated `search_tsv`; reindex on `/sync` push. `?q=` is title `ILIKE` **or** `plainto_tsquery`. Placeholder **Search titles and text**. No snippets, no embeddings. **45** backend tests.
- Phase 5h: follow a user. Sidebar **Follow** / **Following** on remote presence; page scroll / board pan tracks that client’s `selectionV2`. No new protocol or Postgres. Public `/s/:token` has no follow control.
- Phase 5i: workspace collection. `pages.status` (`''` | `todo` | `doing` | `done`); `/w/:id/collection` table + kanban. In-page `affine:database` unchanged. **46** backend tests.
- Phase 5j: page snapshot history. Append-only `doc_revisions` (keep 50); `doc_snapshots` stays the one current compaction row. Toolbar **History**; Save version / preview / restore. Restore hard-resets the live log and remounts without seeding an empty page. **47** backend tests.
- Phase 5k: optional Redis pub/sub for `/sync`. Unset `REDIS_URL` keeps in-process rooms. Set it so two API processes fan out updates and awareness. No web change. **49** backend tests.
- Phase 5l: optional MinIO/S3 blob bytes. Postgres `blobs` stays the catalog; objects go to `MINIO_ENDPOINT` when endpoint+keys are set, else `BLOB_DIR` on disk. Editor still uses `/api/workspaces/:id/blobs` and `/api/blobs/:id`. Compose has an optional `minio` service. **52** backend tests.
- Phase 5m: optional end-to-end encryption of Yjs updates. Owner **Encrypt pages**; clients seal AES-256-GCM envelopes; DEK wrapped to each member’s ECDH P-256 key. Server stores opaque bytes (no merge/search/history/Ask). Public share is 409. Unencrypted workspaces unchanged. **54** backend tests.
- Phase 5n: email invites for people without an account. Unknown email → pending `workspace_invites` + copyable `/invite/:token` (SMTP optional via `SMTP_URL`). Accept sets a password and joins that workspace only (no extra “My workspace”). Existing-user invite still adds immediately. **55** backend tests.
- Phase 5o: optional Google / GitHub OAuth. Unset client id+secret hide the buttons; password login still works. First-time OAuth creates the user + “My workspace”; same email links an existing account. Callback lands on `{APP_PUBLIC_URL}/oauth#refreshToken=…`. Migration `0010_phase5_oauth`. **57** backend tests. Enterprise SAML / company OIDC is not this slice.
- Product backlog: [plans/backlog.md](./plans/backlog.md) (ordered remaining features). Technical leftovers stay in [debt/](./debt/).

## Next (in order)

1. Remaining product backlog — native iOS / Android is next ([backlog.md](./plans/backlog.md)).

Pay down [debt/](./debt/) when it blocks a phase (especially PORT/MCP mismatch and `drizzle-kit generate`).

## Blocked / watch

- `.mcp.json` still points at port **4000**; the API is on **4006**. Cursor project MCP: `.cursor/mcp.json` and `cursor/mcp.json` use 4006. Pointing the API `.env` at live Postgres does not retarget those MCP URLs.
- `drizzle-kit generate` fails on `target: ES2023` — migrations are hand-written until kit is upgraded or given its own tsconfig.
- Auth API tests soft-skip if Postgres is missing; they are not a substitute for a real CI DB.
- BlockSuite 0.19.5 + Vite 8: see [debt/web.md](./debt/web.md) (icon typo rewrite, prebundle, no StrictMode). Docker `npm ci` needs the React `overrides` pin (npm 10 vs npm 12 lockfile).
- After join, the client pushes a full `Y.encodeStateAsUpdate` so first-load local IDB content uploads. `doc_updates` grows until `DOC_SNAPSHOT_EVERY` (default 50) compact into `doc_snapshots`.
- Backend is CJS; `yjs` is ESM — snapshot merge uses dynamic `import('yjs')`.
- ts-node cannot type-resolve `@aws-sdk/client-s3` (tsc can). Blob store loads the SDK with `createRequire`.
- Live Google / GitHub click-through was not finished in the browser this session (API tests use a stub exchanger). Encrypted workspaces still need a password-derived account key after OAuth.
- Leftover GitHub repo `GiftSibiya/src` (nested `src/.git` accident) still exists; deleting it needs a token with `delete_repo`.

## Session log

Add a short entry newest-first.

### 2026-08-31 (phase 5o + live deploy)

- Google / GitHub OAuth: `users.password_hash` nullable, `oauth_accounts`, `GET /api/auth/oauth/status`, start/callback, web `OAuthButtons` + `/oauth` catch page. Unset secrets → no buttons (local default). Migration `0010_phase5_oauth`. API tests with a stub exchanger: new user, reuse, link existing email, bad state, unverified email.
- Live Postgres (Cloud.co.za): `dira_user` on database `dira`, Postgres 18, no SSL. Grants must be issued **while connected to `dira`** (`GRANT USAGE, CREATE ON SCHEMA public`). Applied `0000` … `0010_phase5_oauth` (15 public tables).
- Coolify `dira_web`: `npm ci` now matches the lockfile (React pinned in `overrides` for npm 10). `tsc` accepts WebCrypto buffers via `src/crypto/bytes.ts`. Dockerfile prefixes `https://` when `VITE_API_URL` has no scheme. Nested `src/.git` was removed so GitHub tracks the web source as normal files.

### 2026-08-30 (phase 5n)

- Email invites for people without an account: unknown email creates a pending `workspace_invites` row (7-day token) instead of 404. No `SMTP_URL` → API returns `inviteUrl` for the owner to copy; SMTP sends the same link when set. Accept at `/invite/:token` creates the user in that workspace only.
- Browser: owner invited `invite-guest-…@example.com`; pending row + copyable link; logged-out guest saw **Join My workspace** as editor; accept landed them as **Editor** with no extra workspace; owner reload listed them as a member (no pending). Existing-user invite unchanged. Migration `0009_phase5_invites`.

### 2026-08-30 (phase 5m)

- Optional E2E encryption of Yjs updates: owner **Encrypt pages** generates a workspace DEK in the browser, wraps it for each member’s ECDH P-256 public key, and seals updates with AES-256-GCM (`DR1` envelopes). Password wraps the account private key; the unwrapped JWK stays in `localStorage` (`dira.accountKey`) until logout. Migration `0008_phase5_e2e`.
- Server skips compaction, search reindex, History save, Ask, and public share on encrypted workspaces. Blobs stay unencrypted. Unencrypted workspaces unchanged.
- Browser: **Encrypted** badge; two tabs, typed `e2eplainfnordzymurgy` appeared live on the second; History/Ask hidden; Share says public links are off. API: sealed catchup, stranger 403, share/history 409.

### 2026-08-30 (phase 5l)

- Optional MinIO/S3 for blob bytes: `MINIO_ENDPOINT` + keys → S3 put/get/delete at `{workspaceId}/{blobId}`; empty endpoint → `BLOB_DIR`. Catalog and REST paths unchanged. ts-node cannot type-resolve `@aws-sdk/client-s3`; the store loads it with `createRequire`. Compose includes an optional `minio` service.
- Live API: POST text blob, GET same bytes + `text/plain`, stranger 403. Disk store tests still pass. Browser: unique 1×1 PNG in the editor survived reload (`GET /api/blobs/…` 304, image 1×1). Web client unchanged.

### 2026-08-30 (phase 5k)

- Optional Redis fan-out for `/sync`: in-process rooms per API process; `REDIS_URL` publishes updates and awareness so other processes can relay them. Unset URL → same as today. Compose includes an optional `redis` service. Web client unchanged.
- Tests: shared memory hub; two HTTP `/sync` servers with separate rooms — a push on A arrives on B. Local API logs `Sync fan-out in-process`.

### 2026-08-30 (remove Electron)

- Dropped the desktop wrapper: `electron/`, `npm run desktop`, the `electron` package, and the **Desktop** badge. Product is the web app at http://localhost:5181.

### 2026-08-30 (phase 5j)

- History: `doc_revisions` plus `GET/POST /api/pages/:id/snapshots` and restore. Compaction also appends a revision. Restore deletes `doc_updates` and resets the current snapshot (`updateClock: 1`). Migration `0007_phase5_history`.
- Browser: Save version with `histzymurgyfirst`; edit in `histfnordsecond`; restore the first; the editor remounts with the first word and without the later line. Public share has no History. Viewer cannot save/restore (API).

### 2026-08-30 (phase 5i)

- Collection: live pages as a table or kanban with a shared `status`. Sidebar **Collection**; `PATCH` accepts `status`; migration `0006_phase5_collection`. In-page Table/Kanban unchanged.
- Browser: set Untitled to Doing; reload kept it; Kanban put it in the Doing column; trash removed it from Collection. Public share has no Collection. Viewer cannot PATCH (API).

### 2026-08-30 (phase 5h)

- Follow: **On this page** remote rows get **Follow** / **Following**. Viewport tracks the peer’s awareness caret (page) or selected shape/note (board), including Page ↔ Board switch. Stops on **Following**, peer leave, or page change. No new backend.
- Browser: two owner tabs; Follow on A scrolled to B’s `follow-anchor-bottom` caret; Follow while B was on Board switched A to `?view=edgeless`; **Following** toggled off; closing B removed the Follow control. Public share has no Follow.

### 2026-08-30 (phase 5g)

- Body search: extract Y.Text from the page Y.Doc on each sync `push`, store `search_text`, GIN `search_tsv`. Sidebar `?q=` matches title or body. Title `ILIKE` unchanged.
- Browser: two Untitled pages; `fnordzymurgyfts` in the first page’s body; search box keeps that page and hides the empty one.

### 2026-08-30 (phase 5f)

- Added [plans/backlog.md](./plans/backlog.md) as the ordered remaining-product list (debt stays in `docs/debt/`).
- Phone-width reader: **Pages** drawer under 768px, email hidden in the topbar, public share one column. Desktop layout unchanged.
- Browser at 390×844: drawer closed shows editor full width; Pages reveals the tree; choosing a page closes it; at 1280px the sidebar is a persistent column.

### 2026-08-30 (phase 5e)

- Thin Electron wrapper: `npm run desktop` in `dira_web` opens Chromium with its own IndexedDB profile. API and Vite stay separate. Topbar/login show **Desktop**. Preload is CJS because sandboxed ESM preload does not expose `window.diraDesktop`.
- Verified via Chromium DevTools Protocol: login/register, first page, IndexedDB `dira:{workspaceId}:{pageId}`, then close/reopen — same databases and session still there.

### 2026-08-30 (phase 5d)

- Optional page/selection **Ask**: server calls an OpenAI-compatible chat API only when `AI_API_KEY` is set. Members get a panel reply; editors can insert paragraphs. No chats stored, no pgvector.
- Browser (key unset): Ask submit shows “AI is not configured…”; the page stayed editable (`Hello caret — still editable`). Viewer has Ask and no Table/Insert.

### 2026-08-30 (phase 5c)

- Relayed Yjs awareness on the existing `/sync` socket (not stored). Sidebar **On this page** lists email + Active/Idle; BlockSuite remote carets show the name once a color is set on local awareness. Viewers can send awareness; document `push` is still forbidden.
- Browser: two owner tabs listed each other; a background tab showed **Idle**; closing a tab dropped it; a viewer’s name appeared on the owner’s list and as a remote caret label.

### 2026-08-30 (phase 5b)

- Implemented in-page **Table** / **Kanban** via BlockSuite `affine:database` (same page Y.Doc, no SQL). Editors insert from the toolbar; markdown export includes a `|` table (Title + columns, select labels resolved).
- Browser: Table + **Dira row** survived reload; **Live sync row** appeared on a second owner tab without reload; Kanban view visible on the same page; viewer sees the table/kanban read-only with no Table/Kanban buttons.

### 2026-08-30 (phase 5a)

- Implemented the first later slice: edgeless **Board** on the same Y.Doc as Page. No new backend tables. Viewers/public skip empty-page seed and wait for sync so readonly mounts.
- Browser: Page → Board shows canvas + zoom/tools; heading/list still on the note; a rectangle survived reload and appeared on a second tab **live**; viewer opens `?view=edgeless` read-only with the same shape.

### 2026-08-30 (phase 4)

- Implemented Phase 4: nested pages, cascade trash + restore + permanent delete, title search, SQL favorites, client markdown export. Migration `0004_phase4_workspace_ux`. **39** backend tests passing.
- Browser: nest Child Beta under Parent Alpha survives reload; search hides the child; favorite survives reload; trash cascades both into `/trash`; restore parent returns it live with headings/lists; viewer sees Export but no Trash/Child; trash is view-only for viewers.
- Snapshot history left out (optional in the spec).

### 2026-08-30 (phase 3)

- Implemented Phase 3: roles (owner/editor/viewer), invite by existing email, last-owner protection, page view share links, public `/s/:token`. Migration `0003_phase3_sharing`. 38 backend tests passing.
- Browser: owner sees Members + Share; unknown email invite shows a clear error; logged-out visitor on `/s/:token` gets the page read-only with no sibling list.
- Editor WS push allowed; viewer and public push 403 — covered by API tests.

### 2026-08-30 (phase 2)

- Implemented Phase 2: Yjs update log, WebSocket `/sync`, blob upload/download. Migration `0002_phase2_sync` applied. 37 backend tests passing.
- Browser: two tabs, same account, same page — typing in one appears in the other without reload; topbar shows **live**; a 1×1 PNG inserted via blobSync appeared on the second tab; `doc_updates` grew while editing.
- Non-member cannot fetch updates/blobs or `join` (403) — covered by API/WS tests.

### 2026-08-30 (later)

- Implemented Phase 1: pages REST + BlockSuite IndexedDB editor. 35 backend tests passing.
- Browser: register lands in workspace shell; create/list/delete pages; editor mounts; Y.Doc stored under `dira:{workspaceId}:{pageId}`; no WebSocket on the product path.
- Register/login redirect bugs from Phase 0 fixed.

### 2026-08-30

- Built MCP Postgres endpoint and client configs.
- Wrote AFFiNE-inspired phase plans under `docs/plans/`.
- Implemented Phase 0 (auth + workspaces + web shell). Verified register → list → shell → logout in the browser.
- Recorded debt under `docs/debt/`.
- Added this progress file.

## How a later session should start

1. Read this file.
2. Open the next item from [plans/backlog.md](./plans/backlog.md) (or the phase doc under **Next**).
3. If the task is cleanup, pick an item from [debt/](./debt/).
4. When finishing, append a **Session log** bullet and move items between **Done** / **Now** / **Next**, and check the backlog.
