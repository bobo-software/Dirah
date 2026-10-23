# Dira

Postgres-backed markdown knowledge base. Web app and API in one repo.

| Path | What |
| --- | --- |
| `frontend/` | React 19 + Vite web app (served by nginx in production) |
| `backend/` | Express API, docs MCP (`/mcp`), Postgres MCP (`/mcp/protocol`) |

Internal plans, progress notes and technical debt live in the Dirah workspace.
`backend/docs/README.md` points at it.

## Local development

Requires Node 22+ and a Postgres database. `backend/docker-compose.yml` starts
Postgres (host port 5433) and MinIO.

```bash
npm install
cp backend/.env.example backend/.env        # set DB_LOCAL_* (compose: port 5433)
cp frontend/.env.example frontend/.env      # VITE_API_URL must match the API PORT
npm run db:migrate --workspace backend
npm run dev                                 # API and web together
```

Default ports: web `http://localhost:5181`, API `http://localhost:4006`
(both `.env.example` files agree).

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

The `:sec` variants inside each workspace load secrets from Infisical. See
[backend/INFISICAL.md](backend/INFISICAL.md).
