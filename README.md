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

## Docker (local stack)

```bash
docker compose up -d --build
docker compose run --rm backend node dist/migrate.js
```

Open `http://localhost:8080`. The web container proxies `/api` to `backend:4006`
on the compose network; only the web port needs to be public in a deployed
stack. Set `VITE_PUBLIC_API_URL` when building the web image for a real host.

## Self-host with Docker

`docker-compose.selfhost.yml` runs the web and API only. Postgres and MinIO/S3
are **external**: point `DB_*` and `MINIO_*` at services you run or a managed
provider. The bundle does not start them.

```bash
cp .env.selfhost.example .env
# edit .env: external DB/MinIO, public URLs, JWT secrets, first admin
docker compose -f docker-compose.selfhost.yml up -d --build
```

Open `http://localhost:8080` (or `WEB_PORT`). The one-shot `migrate` service
applies pending migrations before the API starts. Upgrades are
`git pull && docker compose -f docker-compose.selfhost.yml up -d --build`.

- One hostname is enough: nginx proxies `/api`, `/mcp` and the OAuth discovery
  paths to `backend:4006`. The MCP URL is `http://localhost:8080/mcp`.
- Plain HTTP is allowed only with `ALLOW_INSECURE_HTTP=true` (localhost/LAN).
  For a public install, put Caddy/Traefik in front, set `APP_PUBLIC_URL`,
  `API_PUBLIC_URL` and `CORS_ORIGIN` to the `https://` origin, and set
  `ALLOW_INSECURE_HTTP=false`.
- `VITE_PUBLIC_API_URL` can stay empty for a same-origin install; the browser
  uses its own origin. Set it only when the API is on a separate host, and
  rebuild the web image after changing it.
- Back up Postgres and the MinIO bucket; the app containers are stateless.


## Deploy (Coolify)

One **Application** with the **Docker Compose** build pack runs the web and API
from `docker-compose.prod.yml`. Postgres and MinIO stay external, as the
existing Coolify-managed services.

| Container | Internal port | Domain |
| --- | --- | --- |
| `web` | 83 | `dirah.co.za` |
| `backend` | 4006 | `api.dirah.co.za` |

- `+ New` → the repo → Build strategy **Compose**; Base Directory `/`; Docker
  Compose Location `docker-compose.prod.yml`; branch `monorepo` until the merge
  lands on `master`.
- Add the domains with the internal port suffix: `https://dirah.co.za:83` on
  service `web` and `https://api.dirah.co.za:4006` on service `backend`.
- Leave **Compose deployment** at the default (not **Raw**), so Coolify can add
  the proxy labels for those domains.
- Put every key from [`.env.example`](.env.example) in Environment Variables
  (Developer view). Coolify writes them to `.env`; the API container reads them
  through `env_file`.
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
- Migrations are an explicit step for the hosted deploy: run
  `docker compose -f docker-compose.prod.yml run --rm backend node dist/migrate.js`
  from a checkout, or `npm run db:migrate` from the repo. Ask before running
  them against the live database.

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
| `npm run db:migrate:prod` | Apply pending SQL with the compiled entrypoint (`node dist/migrate.js`) |
