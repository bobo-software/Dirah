# Infisical

Dirah does not call the Infisical API from application code. The CLI (`@infisical/cli`) fetches secrets and injects them as environment variables before the process starts. If Infisical is not configured, both apps fall back to a local `.env` or to env vars passed in directly.

Self-hosted instance: `https://infisical.bobosoftware.co.za`

`.infisical.json` (from `infisical init`) is gitignored in both repos. It only links a local checkout to a project. It is not used in Docker. The CLI also writes `.infisical.yaml`; that is gitignored too.

## Local

Install the CLI and log in once:

```bash
npm install -g @infisical/cli
infisical login
```

Point the checkout at the project (`infisical init`, or pass `--projectId` / `--domain`). Then use the `:sec` scripts. They run `infisical run --env=dev -- …`, which loads the `dev` environment and starts the normal script.

**backend**

| Script | What it wraps |
| --- | --- |
| `npm run dev:sec` | `npm run dev` |
| `npm run start:sec` | `npm run start` |
| `npm run test:sec` | `npm run test` |
| `npm run db:migrate:sec` | `npm run db:migrate` |
| `npm run db:generate:sec` | `npm run db:generate` |

**frontend**

| Script | What it wraps |
| --- | --- |
| `npm run dev:sec` | `npm run dev` |
| `npm run build:sec` | `npm run build` |
| `npm run preview:sec` | `npm run preview` |

Plain `npm run dev` still reads `.env` as usual. Infisical is optional locally. Leave `VITE_API_URL` unset: the Vite dev server proxies `/api` to `http://localhost:4006`, and nginx does the same in production. `VITE_PUBLIC_API_URL` overrides the API origin shown to users (MCP connectors).

The API, Drizzle, migrations, and both Postgres MCP targets (`local` and `live`) use `DB_*`, `DB_SSL`, and `DB_SSL_CA` in every environment. `DB_SSL_CA` is the CA certificate PEM (a file path is also accepted). Infisical can still inject the other secrets.

## Production values

The API and the web app are **separate Infisical projects**. Coolify holds only the three CLI vars per app; every other value lives here.

| App | Key | Value | Why |
| --- | --- | --- | --- |
| API `prod` | `SESSION_COOKIE_DOMAIN` | `dirah.co.za` | The OAuth callback runs on `api.dirah.co.za`; the refresh cookie must also be sent by `dirah.co.za`. |
| API `prod` | `PORT` | `4006` | Root nginx proxies `/api` to `backend:4006`. |
| Web `prod` | `VITE_PUBLIC_API_URL` | `https://api.dirah.co.za` | MCP connector URLs shown to users. |
| Web `prod` | `VITE_API_URL` | delete | The browser calls its own origin; setting it brings CORS back. |

With the CLI logged in, from each workspace directory:

```bash
cd backend
infisical secrets set SESSION_COOKIE_DOMAIN=dirah.co.za --env=prod

cd ../frontend
infisical secrets set VITE_PUBLIC_API_URL=https://api.dirah.co.za --env=prod
```

**Ordering matters.** `PORT=4006` and deleting `VITE_API_URL` break what is deployed today (the API listens on 4002; the current client calls the API cross-origin). Change them in the same window as the Coolify repoint. `SESSION_COOKIE_DOMAIN` and `VITE_PUBLIC_API_URL` are ignored by the old code, so they are safe to add first.

```bash
# only alongside the Coolify repo/port switch:
cd backend && infisical secrets set PORT=4006 --env=prod
cd ../frontend && infisical secrets delete VITE_API_URL --env=prod
```

## API in Docker / Coolify

Secrets are read when the Node process starts (`dotenv` plus `process.env`). The image installs the CLI in the production stage and wraps the start command. Set these as **runtime** env vars on the container, not as build args:

- `INFISICAL_TOKEN` — service token
- `INFISICAL_ENV` — e.g. `prod`
- `INFISICAL_DOMAIN` — `https://infisical.bobosoftware.co.za`

When all three are set, the container runs:

```bash
infisical run --token="$INFISICAL_TOKEN" --domain="$INFISICAL_DOMAIN" --env="$INFISICAL_ENV" -- node dist/server.js
```

Every secret in that Infisical environment becomes a `process.env` value (`DB_*`, `JWT_SECRET`, `PORT`, and the rest). If any of the three is missing, the container runs `node dist/server.js` with whatever env it was given (`--env-file .env`, Coolify env, and so on).

## Web in Docker / Coolify

Vite inlines `VITE_*` at **build** time. The nginx image does not talk to Infisical at runtime. The build stage installs the CLI and uses Infisical only while `npm run build` runs.

Coolify can skip Infisical and pass this as a Docker **build arg** (the Dockerfile declares matching `ARG` / `ENV`):

- `VITE_PUBLIC_API_URL` (required for a real deploy, e.g. `https://api.dirah.co.za`; local dev defaults to `http://localhost:4006`)

`VITE_API_URL` is optional and only for an API on another origin; the browser normally calls its own origin.

To build from Infisical instead, provide all of:

- `INFISICAL_TOKEN` (build arg, or a BuildKit secret mounted as `infisical_token`)
- `INFISICAL_ENV`
- `INFISICAL_DOMAIN`

Token resolution order in the Dockerfile:

1. BuildKit secret file `/run/secrets/infisical_token`, if present
2. Build arg `INFISICAL_TOKEN`

When domain, env, and token are all set, `scripts/docker-build.sh` runs `infisical secrets get VITE_PUBLIC_API_URL --plain` and exports only that value, then runs `npm run build`. The rest of the production environment is never injected into the Vite build, which executes third-party code. A `VITE_PUBLIC_API_URL` build arg is used when Infisical has no value for it.

An empty `VITE_PUBLIC_API_URL` (common when Infisical or Docker injects a blank value) is treated as missing, and the Docker build refuses to finish.

## What the app never does

- No Infisical SDK import in `dirah_backend` or `dirah_web`
- No Infisical call on dirah_web container start (static files only)
- No failure if Infisical env vars are omitted; the fallback path is the normal one
