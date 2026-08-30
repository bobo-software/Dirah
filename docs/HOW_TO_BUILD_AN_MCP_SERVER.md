# Foro MySQL MCP Server

Authenticated Streamable HTTP MCP endpoint for inspecting and querying the Foro MySQL database from Cursor and other MCP clients. Also exposes domain **sales** tools for listing clients and creating/updating/trashing invoices and quotations, and domain **purchasing** tools for suppliers, purchase orders, and accounts-payable bills.

## Endpoint

- URL: `http://localhost:4003/mcp/protocol` (port from `PORT`)
- Methods: MCP JSON-RPC over Streamable HTTP (`initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/read`)
- Auth: `Authorization: Bearer <MCP_API_KEY>`

This is **greenfield** in `foro-api`. There are no separate `/mcp/mysql/*` REST routes; tools are exposed only through the MCP protocol.

## Tools

### MySQL

| Tool | Purpose |
|------|---------|
| `mysql_list_tables` | List tables in `DB_DATABASE` |
| `mysql_describe_table` | Columns + indexes for one table |
| `mysql_get_table_ddl` | `SHOW CREATE TABLE` |
| `mysql_select` | Single `SELECT` / `WITH` with server-side limit + timeout |
| `mysql_execute_write` | `INSERT` / `UPDATE` / `DELETE` / `CREATE` / `ALTER` / `DROP` / `TRUNCATE` |
| `mysql_migration_status` | Read-only: applied vs. pending Drizzle migrations |
| `mysql_run_migrations` | Apply pending Drizzle migrations (same effect as `npm run db:migrate`) |
| `mysql_bulk_insert` | Chunked, parameterized multi-row `INSERT` (optional upsert) for data-loading |
| `mysql_table_stats` | Row counts per table, for verifying migrated-data completeness |

### Sales

| Tool | Purpose |
|------|---------|
| `sales_list_companies` | List/search companies for a `businessId` (optional `query` on name/email) |
| `sales_list_invoices` | List invoices for a `businessId` (optional `companyId`, `status`, `query`). Excludes trash (`deleted_at` set). |
| `sales_list_quotations` | List quotations for a `businessId` (optional `companyId`, `status`, `query`). Excludes trash. |
| `sales_get_invoice` | Fetch a **live** invoice + line items by `id` and `businessId` (trashed → not found) |
| `sales_get_quotation` | Fetch a **live** quotation + line items by `id` and `businessId` (trashed → not found) |
| `sales_create_invoice` | Create invoice + lines (`confirm: true`); resolve client by `companyId` **or** `companyName` |
| `sales_create_quotation` | Create quotation + lines (`confirm: true`); same client resolution |
| `sales_update_invoice` | Update header and/or replace lines (`confirm: true`). Fails with `TRASHED` if the invoice is in trash. |
| `sales_update_quotation` | Same for quotations. Fails with `TRASHED` if the quotation is in trash. |
| `sales_delete_invoice` | Soft-delete (`confirm: true`) — sets `deleted_at`. Restore with `sales_restore_invoice`. |
| `sales_delete_quotation` | Soft-delete (`confirm: true`). Restore with `sales_restore_quotation`. |
| `sales_restore_invoice` | Clears `deleted_at`. Fails with `NOT_TRASHED` if the row is live. |
| `sales_restore_quotation` | Same for quotations. |
| `sales_list_businesses` | Convenience `businessId` lookup (not an access-control check). |

### Purchasing

| Tool | Purpose |
|------|---------|
| `purchase_list_suppliers` | List/search `companies` flagged `company_type` `supplier`/`both` for a `businessId` (optional `query` on name/email) |
| `purchase_list_purchase_orders` | List purchase orders for a `businessId` (optional `companyId`, `status`, `query`). Excludes trash. |
| `purchase_get_purchase_order` | Fetch a **live** purchase order + line items by `id` and `businessId` (trashed → not found) |
| `purchase_create_purchase_order` | Create purchase order + lines (`confirm: true`); resolve supplier by `companyId` **or** `companyName` |
| `purchase_update_purchase_order` | Update header and/or replace lines (`confirm: true`). Fails with `TRASHED` if in trash. |
| `purchase_delete_purchase_order` | Soft-delete (`confirm: true`) — sets `deleted_at`. Restore with `purchase_restore_purchase_order`. |
| `purchase_restore_purchase_order` | Clears `deleted_at`. Fails with `NOT_TRASHED` if the row is live. |
| `purchase_receive_purchase_order` | Marks `received` (`confirm: true`): bumps `stock_items.quantity` for every line with an `itemId`, then creates an `unpaid` `bills` row for the order total. Fails with `INVALID_STATUS` if already `received`/`cancelled`. |
| `purchase_list_bills` | List accounts-payable bills for a `businessId` (optional `companyId`, `purchaseOrderId`, `status`, `query`). Excludes trash. |
| `purchase_get_bill` | Fetch a **live** bill by `id` and `businessId`. |
| `purchase_update_bill` | Update `status` (e.g. mark `paid`), `dueDate`, and/or `notes` (`confirm: true`). Fails with `TRASHED` if in trash. |

Create tools:

- Require `businessId` and exactly one of `companyId` / `companyName` (case-insensitive name match; ambiguous names fail with matches listed).
- Require at least one line; server computes line totals and header `subtotal` / `taxAmount` / `total`.
- Auto-generate document numbers when omitted (same trailing-number logic as the web app).
- Defaults: `status: draft`, `currency: ZAR`, `issueDate: today (UTC)`, invoice `dueDate` / quotation `validUntil` = issue + 30 days.
- Snapshot customer name/email/address/VAT from the company (overridable via optional fields).
- Invoice creates run the same stock-adjustment hooks as REST when a line has `itemId`.

Example `sales_create_invoice` arguments:

```json
{
  "businessId": 1,
  "companyName": "Acme Corp",
  "taxRate": 15,
  "lines": [
    { "description": "Widget", "quantity": 2, "unitPrice": 50 }
  ],
  "confirm": true
}
```

Example `sales_list_companies` arguments:

```json
{
  "businessId": 1,
  "query": "acme",
  "limit": 50
}
```

## Resource

- `mysql://schema` — JSON snapshot of tables and columns for AI context

## Safety model

### Reads (`mysql_select`)

- Only `SELECT` / `WITH`
- Reject multi-statement SQL
- Apply default/max row limits (`MCP_MYSQL_DEFAULT_SELECT_LIMIT` / `MCP_MYSQL_MAX_SELECT_LIMIT`)
- Enforce query timeout (`MCP_MYSQL_QUERY_TIMEOUT_MS`)
- Prefer `?` placeholders with `params`

### Writes (`mysql_execute_write`)

- Require `confirm: true`
- Reject multi-statement SQL
- Require literal `LIMIT` on `UPDATE` / `DELETE`
- Enforce max write limit (`MCP_MYSQL_MAX_WRITE_LIMIT`)
- Require `allowDestructive: true` for `DROP` / `TRUNCATE`

### Sales writes (`sales_create_*`, `sales_update_*`, `sales_delete_*`)

- Require `confirm: true`
- Always scoped by `businessId`
- Prefer these tools over raw `mysql_execute_write` for invoices/quotations
- Delete is **trash** (`deleted_at`), not a hard delete. Restore tools do not need `confirm`.
- Update/delete fail if the document is already trashed (`TRASHED` / `NOT_FOUND`).

### Purchasing writes (`purchase_create_*`, `purchase_update_*`, `purchase_delete_*`, `purchase_receive_*`)

- Same shape as sales writes: `confirm: true`, scoped by `businessId`, trash instead of hard delete.
- `purchase_receive_purchase_order` is the one side-effecting action beyond plain CRUD — it mutates `stock_items.quantity` and inserts a `bills` row in the same transaction as the status flip, so it either fully succeeds or fully rolls back.

### Identifiers

Metadata tools validate `tableName` with `^[A-Za-z_][A-Za-z0-9_]*$` and escape before composing SQL.

### Migrations (`mysql_migration_status`, `mysql_run_migrations`)

- `mysql_migration_status` is pure read — compares `drizzle/migrations/meta/_journal.json` against the `__drizzle_migrations` table using the exact same cutoff logic drizzle-orm's own `migrate()` uses (single most-recently-applied row's `created_at`), so it never disagrees with what actually running migrations would do. Also flags `hashMismatch` if an already-applied migration file was edited afterward.
- `mysql_run_migrations` requires `confirm: true`. Unlike `mysql_execute_write`, it takes **no `sql` parameter** — it can only replay `.sql` files already committed to the repo and deployed with this server process, so its blast radius is materially smaller than `mysql_execute_write`. Uses a separate, longer timeout (`MCP_MYSQL_MIGRATION_TIMEOUT_MS`) since real `ALTER TABLE`s can run long.
- Known limitation: MySQL/InnoDB DDL isn't truly transactional, so a multi-statement migration failing partway through won't cleanly roll back. Run `mysql_migration_status` afterward to see exactly what landed.

### Bulk load (`mysql_bulk_insert`)

- Requires `confirm: true`. All row objects in one call must share the exact same set of keys (validated up front, before any query runs).
- Table name and every column key go through `assertValidIdentifier`/`escapeIdentifier`; values are always bound via `?` placeholders.
- All-or-nothing per call: one transaction spans every chunk, rolled back on any chunk failure.
- Defaults to plain `INSERT` (fails on duplicate keys); pass `onDuplicateKeyUpdate: true` to upsert instead.
- Row count per call is capped by `MCP_MYSQL_MAX_BULK_INSERT_ROWS`.

## Environment

Reuse DB credentials from `.env.example`:

```
DB_HOST=
DB_PORT=
DB_DATABASE=
DB_USER=
DB_PASSWORD=

MCP_API_KEY=
MCP_MYSQL_POOL_LIMIT=10
MCP_MYSQL_DEFAULT_SELECT_LIMIT=100
MCP_MYSQL_MAX_SELECT_LIMIT=1000
MCP_MYSQL_MAX_WRITE_LIMIT=1000
MCP_MYSQL_QUERY_TIMEOUT_MS=15000
MCP_MYSQL_MIGRATION_TIMEOUT_MS=300000
MCP_MYSQL_MAX_BULK_INSERT_ROWS=5000
```

## Curl examples

Initialize:

```bash
curl -s -X POST "http://127.0.0.1:4003/mcp/protocol" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1.0.0"}}}'
```

List tools:

```bash
curl -s -X POST "http://127.0.0.1:4003/mcp/protocol" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Call `mysql_list_tables`:

```bash
curl -s -X POST "http://127.0.0.1:4003/mcp/protocol" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"mysql_list_tables","arguments":{}}}'
```

Call `sales_create_invoice`:

```bash
curl -s -X POST "http://127.0.0.1:4003/mcp/protocol" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"sales_create_invoice","arguments":{"businessId":1,"companyId":42,"taxRate":15,"lines":[{"description":"Widget","quantity":2,"unitPrice":50}],"confirm":true}}}'
```

## Cursor MCP config example

Add an MCP server entry (do **not** commit real keys):

```json
{
  "mcpServers": {
    "foro-mysql": {
      "type": "http",
      "url": "http://127.0.0.1:4003/mcp/protocol",
      "headers": {
        "Authorization": "Bearer ${env:MCP_API_KEY}"
      }
    }
  }
}
```

Exact Cursor config shape may vary by version; the important parts are the URL and Bearer header.

## Code map

| Path | Role |
|------|------|
| `src/app.ts` | Express `createApp()`, mounts `/mcp/protocol` |
| `src/mcp/createForoMcpExpressHandler.ts` | Official MCP v2 Streamable HTTP adapter |
| `src/mcp/registerMySqlTools.ts` | MySQL tool + resource registration |
| `src/mcp/registerSalesTools.ts` | Sales domain tool registration |
| `src/mcp/registerPurchaseTools.ts` | Purchasing domain tool registration |
| `src/services/mcp/MySqlMcpService.ts` | MySQL database operations |
| `src/services/mcp/SalesMcpService.ts` | Sales list/get/create operations |
| `src/services/mcp/PurchaseMcpService.ts` | Purchasing list/get/create/receive operations |
| `src/services/mcp/salesMcpHelpers.ts` | Totals / date / limit helpers, shared by both sales and purchasing services |
| `src/lib/documentNumbering.ts` | `computeNextDocumentNumber`, shared by the MCP services and the `/purchase-orders/:id/receive` REST endpoint |
| `src/schemas/salesMcpSchemas.ts` | Zod schemas for sales MCP inputs |
| `src/schemas/purchaseMcpSchemas.ts` | Zod schemas for purchasing MCP inputs |
| `src/services/mcp/sqlGuards.ts` | SQL parsing and safety rules |
| `src/db/migrationRunner.ts` | Shared migration status/apply logic (used by `scripts/migrate.ts` and the MCP tools) |
| `src/middlewares/mcpApiKey.ts` | Bearer API key auth |
| `src/config/mcp.ts` | MCP limit/config helpers |

## Suggested next steps

1. Add per-user audit identity once Foro auth is wired into MCP
2. Optional dedicated read-only DB user for MCP MySQL tools
3. Extend sales tools (status updates, quote→invoice convert, payments) if agents need them
