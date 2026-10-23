# Dira

Postgres-backed markdown knowledge base. Web app and API in one repo.

| Path | What |
| --- | --- |
| `frontend/` | React 19 + Vite web app (served by nginx in production) |
| `backend/` | Express API, docs MCP (`/mcp`), Postgres MCP (`/mcp/protocol`) |
| `docs/` | Public docs (internal plans live in the Dirah workspace) |

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

Default ports: web `http://localhost:5181`, API `PORT` from `backend/.env`.

## Scripts

| Script | What |
| --- | --- |
| `npm run dev` | API and web together |
| `npm run dev:api` / `npm run dev:web` | One at a time |
| `npm run build` | Build both workspaces |
| `npm test` | Vitest in both workspaces |
| `npm run typecheck` | `tsc` in both workspaces |
| `npm run lint` | ESLint for the web app |

The `:sec` variants inside each workspace load secrets from Infisical. See
[backend/INFISICAL.md](backend/INFISICAL.md).
