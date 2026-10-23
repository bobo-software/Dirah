# Dira

Postgres-backed markdown knowledge base. Web app and API in one repo.

| Path | What |
| --- | --- |
| `frontend/` | React 19 + Vite web app (served by nginx in production) |
| `backend/` | Express API, docs MCP (`/mcp`), Postgres MCP (`/mcp/protocol`) |

Internal plans, progress notes and technical debt live in the Dirah workspace.
`backend/docs/README.md` points at it.

## Local development

Requires Node 22+ and a Postgres database. Start one from the root compose file
(Postgres on host port 5433), or use your own.

```bash
npm install
cp .env.example .env                        # one file for both workspaces
# edit .env: DB_* must point at your Postgres
npm run db:migrate
npm run dev                                 # API and web together
```

The API reads the root `.env`, and Vite points its `envDir` at it too, so there
is one file to edit. Default ports: web `http://localhost:5181`, API
`http://localhost:4006`. The web calls its own origin and Vite proxies `/api` to
the API, like nginx does in production.

## Docker

```bash
docker compose up -d --build
# Migrations run from a checkout (the runtime image has no ts-node):
DB_HOST=127.0.0.1 DB_PORT=5433 DB_USERNAME=dirah DB_PASSWORD=dirah DB_DATABASE=dirah DB_SSL=disable npm run db:migrate
```

Open `http://localhost:8080`. The web container proxies `/api` to `backend:4006`
on the compose network; only the web port needs to be public in a deployed
stack. Set `VITE_PUBLIC_API_URL` when building the web image for a real host.

## Deploy (Coolify)

One **Service** (Docker Compose) runs the web and API from
`docker-compose.prod.yml`. Postgres and MinIO stay external, as the existing
Coolify-managed services.

| Container | Exposed port | Domain |
| --- | --- | --- |
| `web` | 83 | `dirah.co.za` |
| `backend` | 4006 | `api.dirah.co.za` |

- Point the Service at `/docker-compose.prod.yml`; branch `monorepo` until the
  merge lands on `master`.
- Put every key from [`.env.example`](.env.example) in the Service environment.
  Coolify writes them to `.env` for the compose stack; the API container reads
  them through `env_file`.
- The non-obvious values: `NODE_ENV=production`, `PORT=4006`,
  `SESSION_COOKIE_DOMAIN=dirah.co.za`, and
  `VITE_PUBLIC_API_URL=https://api.dirah.co.za`.
- The web and API hosts differ, so the OAuth callback on the API host needs the
  shared domain to set a refresh cookie the web origin sends. The API refuses to
  boot in production without it.
- Leave `VITE_API_URL` unset: the browser calls its own origin and nginx proxies
  `/api` to `backend:4006`.
- `DB_*` points at the existing Coolify Postgres. `DB_SSL=verify-full` and
  `DB_SSL_CA` (the PEM) are required.
- Migrations are an explicit step from a checkout (`npm run db:migrate`).
  Ask before running them against the live database.

CI lives in `.github/workflows/backend.yml` and `frontend.yml`. A change under
`backend/**` (or the root lockfile) only runs the API checks and image build;
`frontend/**` does the same for the web.

## Scripts

| Script | What |
| --- | --- |
| `npm run dev` | API and web together (`concurrently`) |
| `npm run dev:api` / `npm run dev:web` | One workspace |
| `npm run build` | Build both workspaces |
| `npm test` | Vitest in both workspaces |
| `npm run typecheck` | `tsc` in both workspaces |
| `npm run lint` | ESLint for the web app |
| `npm run db:generate` | Generate a Drizzle migration (`--workspace backend`) |
| `npm run db:migrate` | Apply pending SQL (`--workspace backend`) |
