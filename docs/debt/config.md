# Config drift

## Compose credentials ≠ local `.env`

- [`docker-compose.yml`](../../docker-compose.yml) and [`.env.example`](../../.env.example) use `dira` / `dira` / `dira`.
- Local `.env` uses `DB_USERNAME=postgres` / `DB_PASSWORD=postgres` / `DB_DATABASE=dira`.

A fresh `docker compose up` will not be the database the API is pointed at. Pick one pair and make compose, example, and docs match.

## PORT 4000 vs 4006

- Default in [`src/config/env.ts`](../../src/config/env.ts) and `.env.example`: **4000**.
- Local `.env` and `dira_web` `VITE_API_URL`: **4006**.

Anyone following only `.env.example` will miss the web app. Either standardize on 4000 in examples and MCP configs, or document 4006 as the local convention.

## CORS fallback is `*`

[`src/config/env.ts`](../../src/config/env.ts) uses `CORS_ORIGIN ?? '*'`. Production must always set `CORS_ORIGIN`. Consider failing boot if it is unset when `NODE_ENV=production`.

Local CORS (`http://localhost:5181`) already matches Vite `server.port` in `dira_web` — that part is fine.

## Plans still describe leftover MySQL

[`docs/plans/01-architecture.md`](../plans/01-architecture.md) and [`docs/plans/phase-0-foundation.md`](../plans/phase-0-foundation.md) still say compose ships SchoolOS MySQL. Compose is Postgres now. Update those sentences so the plan folder is not a second source of lies.
