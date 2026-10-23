# Dirah API

HTTP API and MCP servers for [Dirah](https://dirah.co.za), a Postgres-backed markdown knowledge base. Pages live in workspaces as a tree of folders and markdown files. The web app is [`frontend`](../frontend).

Product notes, plans, and runbooks live in the Dirah workspace itself (`folder/readme.md` or `docs/`), not under `docs/` in this repo. `docs/README.md` only points there.

## Stack

- Node.js, TypeScript, Express 4
- PostgreSQL 16 with [Drizzle ORM](https://orm.drizzle.team/)
- JWT access tokens and httpOnly refresh cookies
- Optional S3-compatible blobs (MinIO) or files on disk
- Two MCP endpoints: docs for agents, Postgres for operators

Docker builds use Node 26. Locally, Node 22 or newer matches `tsconfig` (`@tsconfig/node22`).

## Layout

```
src/
  server.ts          process entry; listens and logs what is enabled
  app.ts             Express app, services, routes, both MCP handlers
  routes/            HTTP routers under /api
  controllers/       request handlers
  services/          workspace, page, auth, share, crypto, AI, MCP
  db/schemas/        Drizzle tables
  mcp/               docs MCP and Postgres MCP tool registration
  middlewares/       auth, rate limits, errors
  blobs/             disk or MinIO storage
  mail/              invite email
  oauth/             Google and GitHub
  config/            env, database selection, MCP limits
drizzle/migrations/  committed SQL
src/migrate.ts       compiled runtime migration entry (`node dist/migrate.js`)
scripts/migrate.ts   dev migration entry (`npm run db:migrate`, ts-node)
postman/             collection fragments
```

## Local setup

You need Node, npm, and Postgres. Run from the repo root; one `npm install` covers both workspaces. The compose file also starts MinIO if you want object storage.

```bash
npm install
docker compose up -d postgres
cp .env.example .env
```

Then align the database and the port with the web app:

- Compose publishes Postgres on **host port 5433** as user `dirah`, password `dirah`, database `dirah`. Set `DB_PORT=5433` in the root `.env`; a Postgres you already run on 5432 can keep the defaults.
- The API listens on `PORT`. Unset, that is **4000**, and the root `.env.example` sets **4006** so the API matches the web client default. `CORS_ORIGIN` must be the web origin, `http://localhost:5181`.

Apply migrations and start:

```bash
npm run db:migrate
npm run dev
```

Both run from the repo root (`--workspace backend`). `npm run dev` uses nodemon and `ts-node`. It reads the root `.env`; copy [`../.env.example`](../.env.example) to the repo root and fill in the values.

The API, Drizzle, migrations, and both Postgres MCP targets use `DB_*` in every environment, including development. Set `DB_SSL=disable` for a local database and `verify-full` for the remote one. `DB_LOCAL_*` are no longer read.

Health check: `GET http://localhost:4006/health` (or whatever `PORT` you set). The same payload is on `GET /api/health`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Watch `src/` and run `ts-node src/server.ts` |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run `node dist/server.js` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest, once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run db:generate` | Generate a Drizzle migration from schema changes |
| `npm run db:migrate` | Apply pending SQL in `drizzle/migrations` (ts-node) |
| `npm run db:migrate:prod` | Apply pending SQL with the compiled `dist/migrate.js` (Docker) |

## Environment

Copy [`../.env.example`](../.env.example) to `.env` at the repo root. Groups:

| Group | Variables | Notes |
| --- | --- | --- |
| Server | `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `APP_PUBLIC_URL`, `API_PUBLIC_URL`, `ALLOW_INSECURE_HTTP` | `APP_PUBLIC_URL` is the web origin used in invite links. `API_PUBLIC_URL` is this API, used in OAuth callbacks and MCP metadata. `ALLOW_INSECURE_HTTP=true` is for a self-hosted localhost/LAN install over plain HTTP only. |
| Auth | `JWT_SECRET`, `JWT_REFRESH_SECRET` | Dev defaults exist. Production refuses to boot unless both are unique and at least 32 characters. |
| System admin | `SYSTEM_ADMIN_EMAIL`, `SYSTEM_ADMIN_PASSWORD` | Creates the first row in `system_admins` when that table is empty. Leave blank to skip. |
| Postgres | `DB_*`, `DB_SSL`, `DB_SSL_CA` | `DB_*` is used in every environment. `DB_SSL` is `disable` or `verify-full`. `DB_SSL_CA` is a PEM or a path to one. |
| Mail | `SMTP_*` | Empty `SMTP_HOST` skips sending. Invite responses then include a copyable `inviteUrl`. |
| Blobs | `BLOB_DIR` or `MINIO_*` | Empty `MINIO_ENDPOINT` stores files under `BLOB_DIR` (default `uploads/`). |
| Copilot | `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | Empty key disables Ask. Editing still works. OpenAI-compatible. |
| OAuth | `GOOGLE_*`, `GITHUB_*` | Empty pair hides that provider. Callbacks are `{API_PUBLIC_URL}/api/auth/oauth/google/callback` and `.../github/callback`. |
| MCP | `MCP_API_KEY`, `MCP_PG_*`, `MCP_DOCS_*` | `MCP_API_KEY` guards `/mcp/protocol`. Docs MCP uses per-user tokens, not this key. |
| Rate limits | `AUTH_LOGIN_*`, `AUTH_REFRESH_*` | Per IP. Login, register, and invite accept share the login window. Behind nginx the API trusts private proxy ranges to find the client IP. |
| Cookies | `SESSION_COOKIE_DOMAIN` | Bare domain shared by the web and API hosts, so the OAuth callback's refresh cookie is sent to the web origin. Empty for a single host. |

Production (`NODE_ENV=production`) also requires `CORS_ORIGIN`, `APP_PUBLIC_URL`, and `API_PUBLIC_URL` to be explicit `https` origins, `MINIO_ENDPOINT` to be `https://` when object storage is set, and `SESSION_COOKIE_DOMAIN` when the web and API hosts differ (e.g. `dirah.co.za` for `dirah.co.za` + `api.dirah.co.za`). A self-hosted install over plain HTTP must set `ALLOW_INSECURE_HTTP=true`; that also allows an `http://` `MINIO_ENDPOINT` on a private network.

## HTTP API

JSON envelope:

```json
{ "success": true, "message": "…", "data": {} }
```

Failures use `success: false`. Authenticated routes take `Authorization: Bearer <accessToken>` and `credentials: include` so the refresh cookie is sent.

Refresh cookies are httpOnly, `SameSite=Lax`, and `Secure` when the API public URL is `https`:

- Users: `dirah_refresh` on path `/api/auth` (7 days)
- System admins: `dirah_admin_refresh` on path `/api/admin/auth`

| Prefix | Purpose |
| --- | --- |
| `POST /api/auth/register`, `/login`, `/refresh`, `/logout` | Password session |
| `GET /api/auth/me` | Current user |
| `GET /api/auth/oauth/status`, `/oauth/:provider/start`, `/oauth/:provider/callback` | Google or GitHub. `:provider` is `google` or `github`. |
| `GET/PUT /api/auth/crypto` | User key material for encrypted workspaces |
| `GET/POST /api/workspaces` | List and create |
| `GET/PATCH/DELETE /api/workspaces/:id` | One workspace. `DELETE` needs `{ confirmName }` (the exact name), hides it at once and purges it after 48 hours |
| `GET/POST /api/workspaces/:id/pages` | Page tree |
| `GET/POST /api/workspaces/:id/blobs` | List and upload (raw body, 12 MB) |
| `GET/POST/PATCH/DELETE …/members` and `…/invites/:inviteId` | Members. Owners manage roles. |
| `GET/POST/PUT /api/workspaces/:id/crypto` | Enable encryption and wrap member keys |
| `GET/PUT /api/pages/:id/markdown` | Markdown body |
| `PATCH/DELETE /api/pages/:id` | Rename, move, trash |
| `POST /api/pages/:id/restore`, `DELETE /api/pages/:id/permanent` | Trash |
| `PUT/DELETE /api/pages/:id/favorite` | Favorites |
| `GET/POST/DELETE /api/pages/:id/share` | Public share links |
| `GET /api/public/pages/:token` | Unauthenticated read of a shared page, its markdown, and blobs |
| `GET/POST /api/invites/:token` | Preview and accept an invite |
| `GET /api/ai/status`, `POST /api/ai/pages/:id` | Copilot |
| `GET/POST/PATCH/DELETE /api/mcp/tokens` | Personal MCP tokens, rotate, and workspace allowlist |
| `POST /api/admin/auth/login` and `/metrics`, `/users`, `/emails`, `/request-logs`, `/mcp-audit` | System admin. Separate session from users. |

Workspace roles are `owner`, `editor`, and `viewer`. Editors change pages. Only owners manage members and workspace settings.

## Data model

Drizzle schemas are in `src/db/schemas/`. Main tables:

- `users`, `refresh_tokens`, `oauth_accounts`
- `workspaces`, `workspace_members` (`owner` | `editor` | `viewer`)
- `pages` (tree: `parent_id`, `kind` of `markdown` or `folder`, `slug`, soft delete, search text)
- `markdown_bodies`, `page_favorites`, `blobs`, `share_links`, `workspace_invites`

Blob bytes are stored at `userId/workspaceId/kind/blobId` on disk and in the MinIO bucket. The kind folder is `images`, `videos`, `audio`, `documents`, `archives`, or `files`, chosen from the content type.
- `user_crypto`, `workspace_member_keys` (optional encryption)
- `mcp_tokens` and allowlist, audit, OAuth clients and codes
- `system_admins`, `request_logs`, `email_logs`

A workspace can be marked encrypted. The server stores a wrapped data key per member and a wrapped user private key. Page bodies for those workspaces are ciphertext the client decrypts. See `src/services/CryptoService.ts` and the web `src/crypto/workspaceCrypto.ts`.

Schema changes: edit the Drizzle tables, run `npm run db:generate`, commit the SQL under `drizzle/migrations`, then `npm run db:migrate`.

## Docs MCP

`POST`/`GET` (Streamable HTTP) at `/mcp`.

Agents authenticate with a Bearer token, either a personal token created in settings (`/api/mcp/tokens`) or an OAuth access token. Tokens are allowlisted to specific workspaces. Calls are rate-limited (`MCP_DOCS_RATE_LIMIT`) and written to the MCP audit log.

### OAuth (Claude, ChatGPT, and other AI apps)

Customers add `<API_PUBLIC_URL>/mcp` as a custom connector and sign in. Nothing to paste. The flow follows the MCP authorization spec (OAuth 2.1):

- Discovery: `/.well-known/oauth-protected-resource` (also `/.well-known/oauth-protected-resource/mcp`), `/.well-known/oauth-authorization-server` (also `/.well-known/openid-configuration`). Open CORS on these and `/mcp/oauth/*`.
- Dynamic client registration at `POST /mcp/oauth/register`. Public clients only (`token_endpoint_auth_method: none`). Redirect URIs must be https, http loopback, or a private-use scheme.
- `GET /mcp/oauth/authorize` checks the client and redirect URI, then sends the user to the web consent page (`/settings/mcp-oauth`). The user picks workspaces and read/write per workspace there.
- `POST /mcp/oauth/token` supports `authorization_code` (PKCE S256 required) and `refresh_token`. Access tokens are 1h JWTs with `aud` = `<API_PUBLIC_URL>/mcp` (RFC 8707 `resource`). Refresh tokens last 30 days and rotate on every use. Reusing an old refresh token revokes the chain.
- `POST /mcp/oauth/revoke` (RFC 7009).
- Each connected app is an `mcp_tokens` row with `oauth_client_id` set. "Disconnect app" in settings revokes it, along with its refresh tokens.

Tools: `dirah_guide`, `list_workspaces`, `list_tree`, `read_file`, `write_file`, `edit_file`, `create_folder`, `rename`, `move`, `delete`, `search_docs`.

Resources: `dirah://guide` and `dirah://{workspace}/{path}`.

Prefer paths such as `docs/api/auth.md` over page UUIDs. Pass the `hash` from `read_file` into `edit_file` and `write_file`. Omit `workspace` when the token has a single allowlisted workspace.

## Postgres MCP

`/mcp/protocol`, guarded by `Authorization: Bearer <MCP_API_KEY>`. This is an operator tool, separate from user docs tokens.

`target` is `local` (default; the database this process uses) or `live` (`DB_*` with TLS settings).

Tools: `pg_list_tables`, `pg_describe_table`, `pg_get_table_ddl`, `pg_select`, `pg_execute_write`, `pg_migration_status`, `pg_run_migrations`, `pg_bulk_insert`, `pg_table_stats`.

Writes require `confirm: true`. `DROP` and `TRUNCATE` also require `allowDestructive: true`. Selects are timeout- and row-limited (`MCP_PG_*`).

## MCP client config

`.mcp.json` and `cursor/mcp.json` are personal files and are gitignored. Copy the matching `*.example` and fill the placeholders:

```bash
cp .mcp.json.example .mcp.json          # Claude Code
cp cursor/mcp.json.example cursor/mcp.json   # Cursor
```

`${env:MCP_API_KEY}` is the Postgres MCP key (`MCP_API_KEY` in `.env`). `${env:DIRAH_DOCS_MCP_TOKEN}` is a personal docs token from **Settings → MCP** in the web app.

## Tests

```bash
npm test
```

Vitest covers routes with Supertest, plus SQL guards, auth rate limits, slugs, frontmatter, and database env selection. Tests live next to the code as `*.test.ts` and `*.api.test.ts`.

## Docker

Build from the repo root so the workspace lockfile is available:

```bash
docker build -f backend/Dockerfile -t dirah-backend .
```

The image is a two-stage build. The runtime image is plain Node and starts `node dist/server.js`.

- `EXPOSE 4006` is the image metadata. The process listens on `PORT` (4006 in the root compose file), and the healthcheck calls `http://127.0.0.1:${PORT:-4006}/health`.
- Pass configuration as normal environment variables: `docker run --env-file .env`, or the Coolify environment. Nothing is fetched at build or start time.

The root [docker-compose.yml](../docker-compose.yml) starts Postgres (`5433`), MinIO (`9000`, console `9001`), the API (`4006`) and the web app (`8080`).

## Related

- Web app: [`frontend`](../frontend)
- Environment: [`../.env.example`](../.env.example)
- Where product docs live: [docs/README.md](docs/README.md)
