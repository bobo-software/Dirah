# Dira Postgres MCP Server

Authenticated Streamable HTTP MCP endpoint for inspecting and querying the Dira PostgreSQL database from Cursor and other MCP clients.

## Endpoint

- URL: `http://localhost:4000/mcp/protocol` (port from `PORT`)
- Methods: MCP JSON-RPC over Streamable HTTP (`initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/read`)
- Auth: `Authorization: Bearer <MCP_API_KEY>`

Tools are exposed only through the MCP protocol (no separate `/mcp/postgres/*` REST routes).

The MCP URL port **must match `PORT`**. `.env.example` defaults to `4000`. If your local `.env` uses a different port, update [`.mcp.json`](../.mcp.json) and [`cursor/mcp.json`](../cursor/mcp.json) to match.

## Tools

| Tool | Purpose |
|------|---------|
| `pg_list_tables` | List tables in `DB_DATABASE` (`public` schema) |
| `pg_describe_table` | Columns + indexes for one table |
| `pg_get_table_ddl` | Reconstructed `CREATE TABLE` from `pg_catalog` |
| `pg_select` | Single `SELECT` / `WITH` with server-side limit + timeout |
| `pg_execute_write` | `INSERT` / `UPDATE` / `DELETE` / `CREATE` / `ALTER` / `DROP` / `TRUNCATE` |
| `pg_migration_status` | Read-only: applied vs. pending Drizzle migrations |
| `pg_run_migrations` | Apply pending Drizzle migrations (same effect as `npm run db:migrate`) |
| `pg_bulk_insert` | Chunked, parameterized multi-row `INSERT` (optional `ON CONFLICT` upsert) |
| `pg_table_stats` | Row counts per table, for verifying migrated-data completeness |

## Resource

- `postgres://schema` — JSON snapshot of tables and columns for AI context

## Safety model

### Reads (`pg_select`)

- Only `SELECT` / `WITH`
- Reject multi-statement SQL
- Apply default/max row limits (`MCP_PG_DEFAULT_SELECT_LIMIT` / `MCP_PG_MAX_SELECT_LIMIT`)
- Enforce query timeout (`MCP_PG_QUERY_TIMEOUT_MS` via `statement_timeout`)
- Prefer `?` placeholders with `params` (converted to `$1, $2, …` before parsing and executing; `$n` also works)

### Writes (`pg_execute_write`)

- Require `confirm: true`
- Reject multi-statement SQL
- Require a `WHERE` clause on `UPDATE` / `DELETE` (unconstrained writes are rejected)
- Wrap `UPDATE` / `DELETE` with a `ctid` subquery limited by `MCP_PG_MAX_WRITE_LIMIT` (Postgres has no `UPDATE … LIMIT`)
- Require `allowDestructive: true` for `DROP` / `TRUNCATE`

### Identifiers

Metadata tools validate `tableName` with `^[A-Za-z_][A-Za-z0-9_]*$` and quote with `"…"` before composing SQL.

### Migrations (`pg_migration_status`, `pg_run_migrations`)

- `pg_migration_status` is pure read — compares `drizzle/migrations/meta/_journal.json` against the `__drizzle_migrations` table using the same cutoff logic drizzle-orm's `migrate()` uses (single most-recently-applied row's `created_at`). Also flags `hashMismatch` if an already-applied migration file was edited afterward. Safe when no migrations folder exists yet (`folderMissing: true`).
- `pg_run_migrations` requires `confirm: true`. Unlike `pg_execute_write`, it takes **no `sql` parameter** — it can only replay `.sql` files already committed to the repo. Uses a longer timeout (`MCP_PG_MIGRATION_TIMEOUT_MS`).
- Known limitation: some Postgres DDL is not transactional; a multi-statement migration failing partway through may not fully roll back. Run `pg_migration_status` afterward.

### Bulk load (`pg_bulk_insert`)

- Requires `confirm: true`. All row objects in one call must share the exact same set of keys (validated up front).
- Table name and every column key go through `assertValidIdentifier`/`escapeIdentifier`; values are always bound via placeholders.
- All-or-nothing per call: one transaction spans every chunk, rolled back on any chunk failure.
- Defaults to plain `INSERT` (fails on duplicate keys); pass `upsert: true` with `conflictTarget` columns for `ON CONFLICT … DO UPDATE`.
- Row count per call is capped by `MCP_PG_MAX_BULK_INSERT_ROWS`.

## Environment

Reuse DB credentials from `.env.example`:

```
DB_HOST=
DB_PORT=
DB_USERNAME=
DB_PASSWORD=
DB_DATABASE=

MCP_API_KEY=
MCP_PG_POOL_LIMIT=10
MCP_PG_DEFAULT_SELECT_LIMIT=100
MCP_PG_MAX_SELECT_LIMIT=1000
MCP_PG_MAX_WRITE_LIMIT=1000
MCP_PG_QUERY_TIMEOUT_MS=15000
MCP_PG_MIGRATION_TIMEOUT_MS=300000
MCP_PG_MAX_BULK_INSERT_ROWS=5000
```

## Curl examples

Initialize:

```bash
curl -s -X POST "http://127.0.0.1:4000/mcp/protocol" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1.0.0"}}}'
```

List tools:

```bash
curl -s -X POST "http://127.0.0.1:4000/mcp/protocol" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Call `pg_list_tables`:

```bash
curl -s -X POST "http://127.0.0.1:4000/mcp/protocol" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"pg_list_tables","arguments":{}}}'
```

## Cursor MCP config example

Add an MCP server entry (do **not** commit real keys):

```json
{
  "mcpServers": {
    "dira-postgres": {
      "type": "http",
      "url": "http://127.0.0.1:4000/mcp/protocol",
      "headers": {
        "Authorization": "Bearer ${env:MCP_API_KEY}"
      }
    }
  }
}
```

Exact Cursor config shape may vary by version; the important parts are the URL and Bearer header. Project copies live at [`.mcp.json`](../.mcp.json) and [`cursor/mcp.json`](../cursor/mcp.json).

## Code map

| Path | Role |
|------|------|
| `src/app.ts` | Express `createApp()`, mounts `/mcp/protocol` |
| `src/mcp/createDiraMcpExpressHandler.ts` | Official MCP v2 Streamable HTTP adapter |
| `src/mcp/registerPgTools.ts` | Postgres tool + resource registration |
| `src/services/mcp/PgMcpService.ts` | Postgres database operations |
| `src/services/mcp/sqlGuards.ts` | SQL parsing and safety rules |
| `src/db/index.ts` | `pg` pool + Drizzle client |
| `src/db/migrationRunner.ts` | Shared migration status/apply logic (used by `scripts/migrate.ts` and the MCP tools) |
| `src/middlewares/mcpApiKey.ts` | Bearer API key auth |
| `src/config/mcp.ts` | MCP limit/config helpers |

## Suggested next steps

1. Add per-user audit identity once Dira auth is wired into MCP
2. Optional dedicated read-only DB user for MCP Postgres tools
3. Domain tools (once schemas exist) for the operations agents should prefer over raw SQL
