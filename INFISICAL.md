# Infisical

Dirah does not call the Infisical API from application code. The CLI (`@infisical/cli`) fetches secrets and injects them as environment variables before the process starts. If Infisical is not configured, both apps fall back to a local `.env` or to env vars passed in directly.

Self-hosted instance: `https://infisical.bobosoftware.co.za`

`.infisical.json` (from `infisical init`) is gitignored in both repos. It only links a local checkout to a project. It is not used in Docker.

## Local

Install the CLI and log in once:

```bash
npm install -g @infisical/cli
infisical login
```

Point the checkout at the project (`infisical init`, or pass `--projectId` / `--domain`). Then use the `:sec` scripts. They run `infisical run --env=dev -- …`, which loads the `dev` environment and starts the normal script.

**dirah_backend**

| Script | What it wraps |
| --- | --- |
| `npm run dev:sec` | `npm run dev` |
| `npm run start:sec` | `npm run start` |
| `npm run test:sec` | `npm run test` |
| `npm run db:migrate:sec` | `npm run db:migrate` |
| `npm run db:generate:sec` | `npm run db:generate` |

**dirah_web**

| Script | What it wraps |
| --- | --- |
| `npm run dev:sec` | `npm run dev` |
| `npm run build:sec` | `npm run build` |
| `npm run preview:sec` | `npm run preview` |

Plain `npm run dev` still reads `.env` as usual. Infisical is optional locally. A blank `VITE_API_URL` is treated as unset and falls back to `http://localhost:4006`.

## dirah_backend in Docker / Coolify

Secrets are read when the Node process starts (`dotenv` plus `process.env`). The image installs the CLI in the production stage and wraps the start command. Set these as **runtime** env vars on the container, not as build args:

- `INFISICAL_TOKEN` — service token
- `INFISICAL_ENV` — e.g. `prod`
- `INFISICAL_DOMAIN` — `https://infisical.bobosoftware.co.za`

When all three are set, the container runs:

```bash
infisical run --token="$INFISICAL_TOKEN" --domain="$INFISICAL_DOMAIN" --env="$INFISICAL_ENV" -- node dist/server.js
```

Every secret in that Infisical environment becomes a `process.env` value (`DB_*`, `JWT_SECRET`, `PORT`, and the rest). If any of the three is missing, the container runs `node dist/server.js` with whatever env it was given (`--env-file .env`, Coolify env, and so on).

## dirah_web in Docker / Coolify

Vite inlines `VITE_*` at **build** time. The nginx image does not talk to Infisical at runtime. The build stage installs the CLI and uses Infisical only while `npm run build` runs.

Coolify can skip Infisical and pass this as a Docker **build arg** (the Dockerfile declares matching `ARG` / `ENV`):

- `VITE_API_URL` (required for a real deploy; local dev defaults to `http://localhost:4006`)

To build from Infisical instead, provide all of:

- `INFISICAL_TOKEN` (build arg, or a BuildKit secret mounted as `infisical_token`)
- `INFISICAL_ENV`
- `INFISICAL_DOMAIN`

Token resolution order in the Dockerfile:

1. BuildKit secret file `/run/secrets/infisical_token`, if present
2. Build arg `INFISICAL_TOKEN`

When domain, env, and token are all set, the image runs `infisical run … -- sh ./scripts/vite-build.sh`, which checks `VITE_API_URL` and then runs `npm run build`. Otherwise it prints a notice and runs that same build script with the `VITE_*` build args.

An empty `VITE_API_URL=""` (common when Infisical or Docker injects a blank value) is ignored. `src/api/client.ts` turns a blank string into unset before using the local default. The Docker build still refuses to finish when `VITE_API_URL` is missing after that.

## What the app never does

- No Infisical SDK import in `dirah_backend` or `dirah_web`
- No Infisical call on dirah_web container start (static files only)
- No failure if Infisical env vars are omitted; the fallback path is the normal one
