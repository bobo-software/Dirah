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

export type PgDatabaseTarget = 'local' | 'live';

export interface PgMcpToolDatabases {
  local: PgMcpService;
  live: PgMcpService;
}

const databaseTarget = z
  .enum(['local', 'live'])
  .optional()
  .default('local')
  .describe(
    'The database this process uses (DB_* with DB_SSL / DB_SSL_CA). local and live are the same database. Defaults to local.'
  );

function serviceFor(databases: PgMcpToolDatabases, target: PgDatabaseTarget | undefined): PgMcpService {
  return target === 'live' ? databases.live : databases.local;
}

export function registerPgTools(server: PgMcpServerHost, databases: PgMcpToolDatabases): void {
  server.registerTool(
    'pg_list_tables',
    {
      title: 'List Postgres tables',
      description:
        'List tables in a Dirah PostgreSQL database (public schema).',
      inputSchema: z.object({ target: databaseTarget }),
    },
    (async ({ target }: { target?: PgDatabaseTarget }) =>
      asToolContent(await serviceFor(databases, target).listTables())) as never
  );

  server.registerTool(
    'pg_describe_table',
    {
      title: 'Describe Postgres table',
      description:
        'Describe columns and indexes for a table. Table names must be simple identifiers.',
      inputSchema: z.object({
        target: databaseTarget,
        tableName: z.string().min(1),
      }),
    },
    (async ({ target, tableName }: { target?: PgDatabaseTarget; tableName: string }) =>
      asToolContent(await serviceFor(databases, target).describeTable(tableName))) as never
  );

  server.registerTool(
    'pg_get_table_ddl',
    {
      title: 'Get Postgres table DDL',
      description:
        'Reconstruct CREATE TABLE DDL from pg_catalog for a validated table name.',
      inputSchema: z.object({
        target: databaseTarget,
        tableName: z.string().min(1),
      }),
    },
    (async ({ target, tableName }: { target?: PgDatabaseTarget; tableName: string }) =>
      asToolContent(await serviceFor(databases, target).getTableDdl(tableName))) as never
  );

  server.registerTool(
    'pg_select',
    {
      title: 'Run Postgres SELECT',
      description:
        'Execute a single SELECT/WITH statement. Server enforces timeouts and row limits. Use ? placeholders with params.',
      inputSchema: z.object({
        target: databaseTarget,
        sql: z.string().min(1),
        params: z.array(z.unknown()).optional().default([]),
      }),
    },
    (async ({ target, sql, params }: { target?: PgDatabaseTarget; sql: string; params?: unknown[] }) =>
      asToolContent(await serviceFor(databases, target).select(sql, params ?? []))) as never
  );

  server.registerTool(
    'pg_execute_write',
    {
      title: 'Execute Postgres write',
      description:
        'Execute INSERT/UPDATE/DELETE/CREATE/ALTER/DROP/TRUNCATE. Requires confirm:true. DROP/TRUNCATE also require allowDestructive:true. UPDATE/DELETE require a WHERE clause and are wrapped with a ctid LIMIT.',
      inputSchema: z.object({
        target: databaseTarget,
        sql: z.string().min(1),
        confirm: z.boolean(),
        allowDestructive: z.boolean().optional().default(false),
        params: z.array(z.unknown()).optional().default([]),
      }),
    },
    (async ({
      target,
      sql,
      confirm,
      allowDestructive,
      params,
    }: {
      target?: PgDatabaseTarget;
      sql: string;
      confirm: boolean;
      allowDestructive?: boolean;
      params?: unknown[];
    }) =>
      asToolContent(
        await serviceFor(databases, target).executeWrite(sql, {
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
      inputSchema: z.object({ target: databaseTarget }),
    },
    (async ({ target }: { target?: PgDatabaseTarget }) =>
      asToolContent(await serviceFor(databases, target).migrationStatus())) as never
  );

  server.registerTool(
    'pg_run_migrations',
    {
      title: 'Run pending Drizzle migrations',
      description:
        'Apply pending Drizzle migrations (same effect as `npm run db:migrate`). Requires confirm:true. Only replays already-committed .sql files under drizzle/migrations — no arbitrary SQL is accepted.',
      inputSchema: z.object({
        target: databaseTarget,
        confirm: z.boolean(),
      }),
    },
    (async ({ target, confirm }: { target?: PgDatabaseTarget; confirm: boolean }) =>
      asToolContent(await serviceFor(databases, target).runMigrations({ confirm }))) as never
  );

  server.registerTool(
    'pg_bulk_insert',
    {
      title: 'Bulk insert rows',
      description:
        'Chunked, parameterized multi-row INSERT for a table. Requires confirm:true. All rows must share the same set of columns. Defaults to plain INSERT; pass upsert:true with conflictTarget columns for ON CONFLICT DO UPDATE. All-or-nothing per call (rolled back on any chunk failure).',
      inputSchema: z.object({
        target: databaseTarget,
        tableName: z.string().min(1),
        rows: z.array(z.record(z.string(), z.unknown())).min(1),
        confirm: z.boolean(),
        upsert: z.boolean().optional().default(false),
        conflictTarget: z.array(z.string().min(1)).optional(),
        chunkSize: z.number().int().positive().max(500).optional().default(200),
      }),
    },
    (async ({
      target,
      tableName,
      rows,
      confirm,
      upsert,
      conflictTarget,
      chunkSize,
    }: {
      target?: PgDatabaseTarget;
      tableName: string;
      rows: Array<Record<string, unknown>>;
      confirm: boolean;
      upsert?: boolean;
      conflictTarget?: string[];
      chunkSize?: number;
    }) =>
      asToolContent(
        await serviceFor(databases, target).bulkInsert(tableName, rows, {
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
        target: databaseTarget,
        tables: z.array(z.string().min(1)).optional(),
      }),
    },
    (async ({ target, tables }: { target?: PgDatabaseTarget; tables?: string[] }) =>
      asToolContent(await serviceFor(databases, target).tableStats(tables))) as never
  );

  server.registerResource(
    'postgres-schema',
    'postgres://schema',
    {
      title: 'Dirah Postgres schema',
      description: 'Tables and column metadata for the database this API process uses.',
      mimeType: 'application/json',
    },
    (async (uri: URL) => {
      const result = await databases.local.getSchemaResource();
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

  server.registerResource(
    'postgres-schema-live',
    'postgres://schema/live',
    {
      title: 'Live Dirah Postgres schema',
      description: 'Tables and column metadata for the database this API process uses.',
      mimeType: 'application/json',
    },
    (async (uri: URL) => {
      const result = await databases.live.getSchemaResource();
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
