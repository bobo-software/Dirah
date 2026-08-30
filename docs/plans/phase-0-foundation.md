# Phase 0 — Foundation

Users, sessions, and workspaces. No editor yet.

## Goal

A person can register, log in, create a workspace, and see it again after refresh. The database and auth middleware exist so later phases have something to hang pages and sync on.

## User-visible outcome

- `/login` and `/register` screens
- After login: a workspace list (empty state + “New workspace”)
- Opening a workspace shows a **placeholder** shell (sidebar + empty main), not the Vite starter hero
- Logout returns to login

## Backend work

- Replace leftover MySQL in `docker-compose.yml` with **Postgres** matching `.env` (`DB_HOST`, `DB_PORT=5432`, `DB_USERNAME`, `DB_DATABASE`)
- Drizzle schemas + `npm run db:generate` / `db:migrate`
- Password hashing (argon2 or bcrypt)
- Routes (JSON via `ResponseUtils`):
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `POST /api/auth/logout`
  - `GET /api/me`
  - `GET/POST /api/workspaces`
  - `GET /api/workspaces/:id`
- Auth middleware: `Authorization: Bearer` → `req.user` from existing `verifyAccessToken`
- First workspace created automatically on register **or** empty list with explicit create — pick one and keep it; prefer **auto-create “My workspace”** so phase 1 has a default `workspaceId`

## Web work

- `react-router`
- Auth context: access token in memory; refresh token in `httpOnly` cookie **or** `localStorage` (document the choice in code comments)
- Protected routes
- Minimal chrome: top bar (user email, logout), workspace switcher
- `VITE_API_URL` in `.env.example`

## Data model

```text
users
  id, email (unique), password_hash, created_at, updated_at

refresh_tokens
  id, user_id, token_hash, expires_at, revoked_at, created_at

workspaces
  id, name, created_at, updated_at

workspace_members
  workspace_id, user_id, role  -- phase 0: only 'owner'
  unique (workspace_id, user_id)
```

`pages`, `doc_updates`, blobs: **not in this phase**.

## Acceptance checks

- Register with a new email returns tokens; duplicate email is 409
- Login with wrong password is 401
- `GET /api/workspaces` without a token is 401
- Authenticated user sees at least one workspace they own
- Refresh rotates or re-issues access token; revoked refresh token fails
- `npm run db:migrate` against local Postgres succeeds
- `GET /health` still works
- MCP `pg_list_tables` shows the new tables after migrate

## Not in this phase

- Page editor, Yjs, IndexedDB
- Invites, roles other than owner
- WebSocket
- Email verification, OAuth, password reset
- Redis

## Related

- Architecture: [01-architecture.md](./01-architecture.md)
- Next: [phase-1-local-editor.md](./phase-1-local-editor.md)
