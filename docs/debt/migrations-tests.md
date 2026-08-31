# Migrations and tests

## `drizzle-kit generate` is broken

```
Invalid target "es2023" in "--target=es2023"
```

[`tsconfig.json`](../../tsconfig.json) `target: ES2023` is more than drizzle-kit **0.24** accepts. Schema → SQL currently has to be written by hand ([`drizzle/migrations/0000_phase0_foundation.sql`](../../drizzle/migrations/0000_phase0_foundation.sql)). There is no kit `*_snapshot.json`, so a future generate cannot diff cleanly.

Fix: upgrade drizzle-kit, or give kit a separate tsconfig with an older `target`.

## Drizzle stores history in `drizzle.__drizzle_migrations`

Postgres migrator uses schema `drizzle`, not `public.__drizzle_migrations`. [`src/db/migrationRunner.ts`](../../src/db/migrationRunner.ts) was updated to match. Docs and the MCP protocol mock still say `__drizzle_migrations` with no schema — easy to query the wrong place.

## Tests default to a database compose does not create

[`vitest.setup.ts`](../../vitest.setup.ts) sets `DB_DATABASE=dira_test` and user `dira_test`. [`docker-compose.yml`](../../docker-compose.yml) only creates `dira`. Auth tests against compose-from-scratch need a test DB provisioned, or tests should use the same `DB_*` as `.env`.

## Auth API tests soft-skip

[`src/routes/auth.api.test.ts`](../../src/routes/auth.api.test.ts) catches connection failure, sets `dbReady = false`, and the big register/refresh test **returns without failing**. CI can be green while Phase 0 never ran. Prefer `describe.skipIf` with a loud log, or fail when `CI=true`.

## Live schema grants

On managed Postgres 15+, the app role may connect but still fail `CREATE TABLE` until `GRANT USAGE, CREATE ON SCHEMA public` is issued **on the product database** (`dira`), not only while connected to `postgres`. Live Cloud.co.za has this grant; keep it when recreating the role.

## Startup does not ping the database

[`verifyDatabaseConnection`](../../src/db/index.ts) is exported and unused. [`src/server.ts`](../../src/server.ts) will listen even if Postgres is down; the first register then 500s (as happened before migrate). Call verify on boot in development, or at least log a warning.
