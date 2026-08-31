import { z } from 'zod';
import type { PgMcpService, McpToolResult } from '../services/mcp/PgMcpService';

/** Duck type for MCP server methods we use (avoids ESM/CJS type dual-package issues). */
export interface PgMcpServerHost {
  registerTool: (
    name: string,
    config: Record<string, unknown>,
    cb: (...args: never[]) => unknown
  ) => unknown;
  registerResource: (
    name: string,
    uriOrTemplate: string | unknown,
    config: Record<string, unknown>,
    readCallback: (uri: URL, variables?: Record<string, string | string[]>) => unknown
  ) => unknown;
}

function asToolContent(result: McpToolResult): {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    ...(result.success ? {} : { isError: true }),
  };
}

export function registerPgTools(server: PgMcpServerHost, service: PgMcpService): void {
  server.registerTool(
    'pg_list_tables',
    {
      title: 'List Postgres tables',
      description: 'List tables in the configured Dira PostgreSQL database (public schema).',
      inputSchema: z.object({}),
    },
    (async () => asToolContent(await service.listTables())) as never
  );

  server.registerTool(
    'pg_describe_table',
    {
      title: 'Describe Postgres table',
      description:
        'Describe columns and indexes for a table. Table names must be simple identifiers.',
      inputSchema: z.object({
        tableName: z.string().min(1),
      }),
    },
    (async ({ tableName }: { tableName: string }) =>
      asToolContent(await service.describeTable(tableName))) as never
  );

  server.registerTool(
    'pg_get_table_ddl',
    {
      title: 'Get Postgres table DDL',
      description: 'Reconstruct CREATE TABLE DDL from pg_catalog for a validated table name.',
      inputSchema: z.object({
        tableName: z.string().min(1),
      }),
    },
    (async ({ tableName }: { tableName: string }) =>
      asToolContent(await service.getTableDdl(tableName))) as never
  );

  server.registerTool(
    'pg_select',
    {
      title: 'Run Postgres SELECT',
      description:
        'Execute a single SELECT/WITH statement. Server enforces timeouts and row limits. Use ? placeholders with params.',
      inputSchema: z.object({
        sql: z.string().min(1),
        params: z.array(z.unknown()).optional().default([]),
      }),
    },
    (async ({ sql, params }: { sql: string; params?: unknown[] }) =>
      asToolContent(await service.select(sql, params ?? []))) as never
  );

  server.registerTool(
    'pg_execute_write',
    {
      title: 'Execute Postgres write',
      description:
        'Execute INSERT/UPDATE/DELETE/CREATE/ALTER/DROP/TRUNCATE. Requires confirm:true. DROP/TRUNCATE also require allowDestructive:true. UPDATE/DELETE require a WHERE clause and are wrapped with a ctid LIMIT.',
      inputSchema: z.object({
        sql: z.string().min(1),
        confirm: z.boolean(),
        allowDestructive: z.boolean().optional().default(false),
        params: z.array(z.unknown()).optional().default([]),
      }),
    },
    (async ({
      sql,
      confirm,
      allowDestructive,
      params,
    }: {
      sql: string;
      confirm: boolean;
      allowDestructive?: boolean;
      params?: unknown[];
    }) =>
      asToolContent(
        await service.executeWrite(sql, {
          confirm,
          allowDestructive,
          params: params ?? [],
        })
      )) as never
  );

  server.registerTool(
    'pg_migration_status',
    {
      title: 'Drizzle migration status',
      description:
        'Report which Drizzle migrations (drizzle/migrations) are applied vs. pending, read-only. Safe when no migrations exist yet.',
      inputSchema: z.object({}),
    },
    (async () => asToolContent(await service.migrationStatus())) as never
  );

  server.registerTool(
    'pg_run_migrations',
    {
      title: 'Run pending Drizzle migrations',
      description:
        'Apply pending Drizzle migrations (same effect as `npm run db:migrate`). Requires confirm:true. Only replays already-committed .sql files under drizzle/migrations — no arbitrary SQL is accepted.',
      inputSchema: z.object({
        confirm: z.boolean(),
      }),
    },
    (async ({ confirm }: { confirm: boolean }) =>
      asToolContent(await service.runMigrations({ confirm }))) as never
  );

  server.registerTool(
    'pg_bulk_insert',
    {
      title: 'Bulk insert rows',
      description:
        'Chunked, parameterized multi-row INSERT for a table. Requires confirm:true. All rows must share the same set of columns. Defaults to plain INSERT; pass upsert:true with conflictTarget columns for ON CONFLICT DO UPDATE. All-or-nothing per call (rolled back on any chunk failure).',
      inputSchema: z.object({
        tableName: z.string().min(1),
        rows: z.array(z.record(z.string(), z.unknown())).min(1),
        confirm: z.boolean(),
        upsert: z.boolean().optional().default(false),
        conflictTarget: z.array(z.string().min(1)).optional(),
        chunkSize: z.number().int().positive().max(500).optional().default(200),
      }),
    },
    (async ({
      tableName,
      rows,
      confirm,
      upsert,
      conflictTarget,
      chunkSize,
    }: {
      tableName: string;
      rows: Array<Record<string, unknown>>;
      confirm: boolean;
      upsert?: boolean;
      conflictTarget?: string[];
      chunkSize?: number;
    }) =>
      asToolContent(
        await service.bulkInsert(tableName, rows, {
          confirm,
          upsert,
          conflictTarget,
          chunkSize,
        })
      )) as never
  );

  server.registerTool(
    'pg_table_stats',
    {
      title: 'Postgres table row counts',
      description:
        'Row counts per table (all public tables if none specified). Read-only; useful for verifying migrated-data completeness.',
      inputSchema: z.object({
        tables: z.array(z.string().min(1)).optional(),
      }),
    },
    (async ({ tables }: { tables?: string[] }) =>
      asToolContent(await service.tableStats(tables))) as never
  );

  server.registerResource(
    'postgres-schema',
    'postgres://schema',
    {
      title: 'Dira Postgres schema',
      description: 'Current database tables and column metadata for AI context.',
      mimeType: 'application/json',
    },
    (async (uri: URL) => {
      const result = await service.getSchemaResource();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }) as never
  );
}
