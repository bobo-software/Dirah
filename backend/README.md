# Dirah API

HTTP API and MCP servers for [Dirah](https://dirah.co.za), a Postgres-backed markdown knowledge base. Pages live in workspaces as a tree of folders and markdown files. The web app is [`dirah_web`](../dira_web).

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
scripts/migrate.ts   apply pending migrations
postman/             collection fragments
```

## Local setup

You need Node, npm, and Postgres. The compose file also starts MinIO if you want object storage.

```bash
cd dira_backend
npm ci
docker compose up -d postgres
cp .env.example .env
```

Then align the database and the port with the web app:

- Compose publishes Postgres on **host port 5433** as user `dirah`, password `dirah`, database `dirah`. Set `DB_LOCAL_PORT=5433`, `DB_LOCAL_USERNAME=dirah`, and `DB_LOCAL_PASSWORD=dirah`. A Postgres you already run on 5432 can keep the values in `.env.example`.
- The API listens on `PORT`. Unset, that is **4000**, and `.env.example` sets `4000`. The web client defaults to `http://localhost:4006`. Set `PORT=4006` here, or set `VITE_API_URL=http://localhost:4000` in `dirah_web`. `CORS_ORIGIN` must be the web origin, `http://localhost:5181`.

Apply migrations and start:

```bash
npm run db:migrate
npm run dev
```

`npm run dev` uses nodemon and `ts-node`. It reads `.env`. `npm run dev:sec` loads the Infisical `dev` environment first. See [INFISICAL.md](INFISICAL.md).

In `NODE_ENV=development` the API connects with `DB_LOCAL_*` and TLS stays off. `DB_HOST` / `DB_SSL` / `DB_SSL_CA` are the remote database. The deployed API uses those. The Postgres MCP can reach either one.

Health check: `GET http://localhost:4006/health` (or whatever `PORT` you set). The same payload is on `GET /api/health`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Watch `src/` and run `ts-node src/server.ts` |
| `npm run dev:sec` | Same, with Infisical `dev` secrets |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run `node dist/server.js` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest, once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run db:generate` | Generate a Drizzle migration from schema changes |
| `npm run db:migrate` | Apply pending SQL in `drizzle/migrations` |

`:sec` variants exist for `start`, `test`, `db:generate`, and `db:migrate`.

## Environment

Copy `.env.example`. Groups:

| Group | Variables | Notes |
| --- | --- | --- |
| Server | `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `APP_PUBLIC_URL`, `API_PUBLIC_URL` | `APP_PUBLIC_URL` is the web origin used in invite links. `API_PUBLIC_URL` is this API, used in OAuth callbacks and MCP metadata. |
| Auth | `JWT_SECRET`, `JWT_REFRESH_SECRET` | Dev defaults exist. Production refuses to boot unless both are unique and at least 32 characters. |
| System admin | `SYSTEM_ADMIN_EMAIL`, `SYSTEM_ADMIN_PASSWORD` | Creates the first row in `system_admins` when that table is empty. Leave blank to skip. |
| Postgres | `DB_*`, `DB_LOCAL_*`, `DB_SSL`, `DB_SSL_CA` | Development uses `DB_LOCAL_*`. Otherwise `DB_*`. `DB_SSL` is `disable` or `verify-full`. `DB_SSL_CA` is a PEM or a path to one. |
| Mail | `SMTP_*` | Empty `SMTP_HOST` skips sending. Invite responses then include a copyable `inviteUrl`. |
| Blobs | `BLOB_DIR` or `MINIO_*` | Empty `MINIO_ENDPOINT` stores files under `BLOB_DIR` (default `uploads/`). |
| Copilot | `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | Empty key disables Ask. Editing still works. OpenAI-compatible. |
| OAuth | `GOOGLE_*`, `GITHUB_*` | Empty pair hides that provider. Callbacks are `{API_PUBLIC_URL}/api/auth/oauth/google/callback` and `.../github/callback`. |
| MCP | `MCP_API_KEY`, `MCP_PG_*`, `MCP_DOCS_*` | `MCP_API_KEY` guards `/mcp/protocol`. Docs MCP uses per-user tokens, not this key. |
| Rate limits | `AUTH_LOGIN_*`, `AUTH_REFRESH_*` | Per IP. Login, register, and invite accept share the login window. |

Production (`NODE_ENV=production`) also requires `CORS_ORIGIN`, `APP_PUBLIC_URL`, and `API_PUBLIC_URL` to be explicit `https` origins, and `MINIO_ENDPOINT` to be `https://` when object storage is set.

## HTTP API

JSON envelope:

```json
{ "success": true, "message": "…", "data": {} }
```

Failures use `success: false`. Authenticated routes take `Authorization: Bearer <accessToken>` and `credentials: include` so the refresh cookie is sent.

Refresh cookies are httpOnly, `SameSite=Lax`, and `Secure` in production:

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

`Dockerfile` is a two-stage build. The runtime image installs the Infisical CLI and starts through `scripts/infisical-entrypoint.sh`.

- `EXPOSE 4002` is the image metadata. The process listens on `PORT`, and the healthcheck calls `http://127.0.0.1:${PORT:-4000}/health`.
- Set `INFISICAL_TOKEN`, `INFISICAL_ENV`, and `INFISICAL_DOMAIN` as runtime env vars when the container should pull secrets. If any of the three is missing, it runs `node dist/server.js` with the env it was given.

`docker compose up` only starts Postgres (`5433`) and MinIO (`9000`, console `9001`). It does not run the API.

## Related

- Web app: [`dira_web`](../dira_web)
- Secrets: [INFISICAL.md](INFISICAL.md)
- Where product docs live: [docs/README.md](docs/README.md)
