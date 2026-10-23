import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool, QueryResult, QueryResultRow } from 'pg';
import { getMcpConfig } from '../../config/mcp';
import {
  type MigrationStatus,
  getMigrationStatus,
  runPendingMigrations,
} from '../../db/migrationRunner';
import {
  SqlGuardError,
  assertValidIdentifier,
  buildBulkInsertStatement,
  escapeIdentifier,
  guardSelect,
  guardWrite,
  toPgPlaceholders,
} from './sqlGuards';

export interface McpToolResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface PgMcpServiceOptions {
  pool: Pool;
  database: string;
}

export class PgMcpService {
  private readonly pool: Pool;
  private readonly database: string;

  constructor(options: PgMcpServiceOptions) {
    this.pool = options.pool;
    this.database = options.database;
  }

  async listTables(): Promise<McpToolResult<{ tables: string[] }>> {
    return this.runTool('pg_list_tables', async () => {
      const result = await this.queryWithTimeout<{ table_name: string }>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_catalog = $1
           AND table_schema = 'public'
           AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
        [this.database]
      );

      const tables = result.rows.map((row) => String(row.table_name));
      return {
        success: true,
        message: `Found ${tables.length} table(s)`,
        data: { tables },
      };
    });
  }

  async describeTable(
    tableName: string
  ): Promise<McpToolResult<{ table: string; columns: unknown[]; indexes: unknown[] }>> {
    return this.runTool('pg_describe_table', async () => {
      const safeName = assertValidIdentifier(tableName);

      const columns = await this.queryWithTimeout(
        `SELECT
           column_name AS name,
           data_type AS type,
           udt_name,
           is_nullable AS nullable,
           column_default AS default_value,
           character_maximum_length AS max_length,
           numeric_precision,
           numeric_scale
         FROM information_schema.columns
         WHERE table_catalog = $1
           AND table_schema = 'public'
           AND table_name = $2
         ORDER BY ordinal_position`,
        [this.database, safeName]
      );

      if (!columns.rows.length) {
        return {
          success: false,
          message: `Table not found: ${safeName}`,
          error: 'TABLE_NOT_FOUND',
        };
      }

      const indexes = await this.queryWithTimeout(
        `SELECT indexname AS index_name, indexdef AS index_def
         FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = $1
         ORDER BY indexname`,
        [safeName]
      );

      return {
        success: true,
        message: `Described table ${safeName}`,
        data: { table: safeName, columns: columns.rows, indexes: indexes.rows },
      };
    });
  }

  async getTableDdl(
    tableName: string
  ): Promise<McpToolResult<{ table: string; ddl: string }>> {
    return this.runTool('pg_get_table_ddl', async () => {
      const safeName = assertValidIdentifier(tableName);

      const result = await this.queryWithTimeout<{ ddl: string }>(
        `SELECT
           'CREATE TABLE ' || quote_ident(c.relname) || E' (\\n' ||
           pg_catalog.array_to_string(
             array_agg(
               '  ' || quote_ident(a.attname) || ' ' ||
               pg_catalog.format_type(a.atttypid, a.atttypmod) ||
               CASE
                 WHEN a.atthasdef THEN ' DEFAULT ' || pg_get_expr(ad.adbin, ad.adrelid)
                 ELSE ''
               END ||
               CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
               ORDER BY a.attnum
             ),
             E',\\n'
           ) || E'\\n);' AS ddl
         FROM pg_attribute a
         JOIN pg_class c ON a.attrelid = c.oid
         JOIN pg_namespace n ON c.relnamespace = n.oid
         LEFT JOIN pg_attrdef ad ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
         WHERE n.nspname = 'public'
           AND c.relname = $1
           AND c.relkind = 'r'
           AND a.attnum > 0
           AND NOT a.attisdropped
         GROUP BY c.relname`,
        [safeName]
      );

      const ddl = result.rows[0]?.ddl;
      if (!ddl) {
        return {
          success: false,
          message: `Unable to fetch DDL for ${safeName}`,
          error: 'DDL_NOT_FOUND',
        };
      }

      return {
        success: true,
        message: `Fetched DDL for ${safeName}`,
        data: { table: safeName, ddl },
      };
    });
  }

  async select(
    sql: string,
    params: unknown[] = []
  ): Promise<
    McpToolResult<{ rows: unknown[]; rowCount: number; appliedLimit: number; sql: string }>
  > {
    return this.runTool(
      'pg_select',
      async () => {
        const mcp = getMcpConfig();
        const guarded = guardSelect(sql, {
          defaultLimit: mcp.defaultSelectLimit,
          maxLimit: mcp.maxSelectLimit,
        });

        const result = await this.queryWithTimeout(guarded.sql, params);
        const limitedRows = result.rows.slice(0, guarded.appliedLimit);
        return {
          success: true,
          message: `Returned ${limitedRows.length} row(s)`,
          data: {
            rows: limitedRows,
            rowCount: limitedRows.length,
            appliedLimit: guarded.appliedLimit,
            sql: guarded.sql,
          },
        };
      },
      (result) => result.data?.rowCount
    );
  }

  async executeWrite(
    sql: string,
    options: {
      confirm: boolean;
      allowDestructive?: boolean;
      params?: unknown[];
    }
  ): Promise<
    McpToolResult<{
      kind: string;
      affectedRows?: number;
      sql: string;
    }>
  > {
    return this.runTool(
      'pg_execute_write',
      async () => {
        const mcp = getMcpConfig();
        const guarded = guardWrite(sql, {
          confirm: options.confirm,
          allowDestructive: options.allowDestructive === true,
          maxWriteLimit: mcp.maxWriteLimit,
        });

        const result = await this.queryWithTimeout(guarded.sql, options.params ?? []);

        return {
          success: true,
          message: `Executed ${guarded.kind.toUpperCase()}`,
          data: {
            kind: guarded.kind,
            affectedRows: result.rowCount ?? 0,
            sql: guarded.sql,
          },
        };
      },
      (result) => result.data?.affectedRows
    );
  }

  async migrationStatus(): Promise<McpToolResult<MigrationStatus>> {
    return this.runTool('pg_migration_status', async () => {
      const status = await getMigrationStatus(this.pool);
      let message: string;
      if (status.folderMissing) {
        message = 'No drizzle/migrations folder found (none generated yet)';
      } else if (status.inSync) {
        message = `All ${status.totalEntries} migration(s) applied`;
      } else {
        message = `${status.pendingCount} of ${status.totalEntries} migration(s) pending`;
      }
      return {
        success: true,
        message,
        data: status,
      };
    });
  }

  async runMigrations(options: { confirm: boolean }): Promise<
    McpToolResult<{
      ranMigrations: boolean;
      appliedTags: string[];
      before: { appliedCount: number; pendingCount: number; pendingTags: string[] };
      after: { appliedCount: number; pendingCount: number; pendingTags: string[] };
      durationMs: number;
    }>
  > {
    return this.runTool('pg_run_migrations', async () => {
      if (!options.confirm) {
        throw new SqlGuardError('Running migrations requires confirm: true');
      }

      const { migrationTimeoutMs } = getMcpConfig();
      const db = drizzle(this.pool);

      let timer: NodeJS.Timeout | undefined;
      const result = await Promise.race([
        runPendingMigrations(db, this.pool),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`Migration timed out after ${migrationTimeoutMs}ms`));
          }, migrationTimeoutMs);
        }),
      ]).finally(() => {
        if (timer) clearTimeout(timer);
      });

      const summarize = (status: MigrationStatus) => ({
        appliedCount: status.appliedCount,
        pendingCount: status.pendingCount,
        pendingTags: status.entries
          .filter((entry) => !entry.applied)
          .map((entry) => entry.tag),
      });

      return {
        success: true,
        message: result.appliedTags.length
          ? `Applied ${result.appliedTags.length} migration(s): ${result.appliedTags.join(', ')}`
          : 'No pending migrations',
        data: {
          ranMigrations: result.appliedTags.length > 0,
          appliedTags: result.appliedTags,
          before: summarize(result.before),
          after: summarize(result.after),
          durationMs: result.durationMs,
        },
      };
    });
  }

  async bulkInsert(
    tableName: string,
    rows: Array<Record<string, unknown>>,
    options: {
      confirm: boolean;
      upsert?: boolean;
      conflictTarget?: string[];
      chunkSize?: number;
    }
  ): Promise<
    McpToolResult<{
      table: string;
      totalRows: number;
      chunkCount: number;
      chunkSize: number;
      affectedRows: number;
      mode: 'insert' | 'upsert';
    }>
  > {
    return this.runTool(
      'pg_bulk_insert',
      async () => {
        if (!options.confirm) {
          throw new SqlGuardError('Bulk insert requires confirm: true');
        }

        const { maxBulkInsertRows } = getMcpConfig();
        if (rows.length > maxBulkInsertRows) {
          throw new SqlGuardError(
            `Row count ${rows.length} exceeds max bulk insert rows ${maxBulkInsertRows}`
          );
        }

        const safeTable = assertValidIdentifier(tableName);
        const columns = Object.keys(rows[0] ?? {});
        if (!columns.length) {
          throw new SqlGuardError('Each row must have at least one column');
        }
        columns.forEach((column) => assertValidIdentifier(column));

        const columnSet = new Set(columns);
        rows.forEach((row, index) => {
          const rowKeys = Object.keys(row);
          if (rowKeys.length !== columnSet.size || rowKeys.some((key) => !columnSet.has(key))) {
            throw new SqlGuardError(
              `Row ${index} has a different set of columns than row 0. Expected [${columns.join(', ')}], got [${rowKeys.join(', ')}]`
            );
          }
        });

        const chunkSize = options.chunkSize ?? 200;
        const upsert = options.upsert === true;

        const client = await this.pool.connect();
        let affectedRows = 0;
        let chunkCount = 0;
        try {
          await client.query('BEGIN');
          for (let i = 0; i < rows.length; i += chunkSize) {
            const chunk = rows.slice(i, i + chunkSize);
            const { sql, values } = buildBulkInsertStatement(safeTable, columns, chunk, {
              upsert,
              conflictTarget: options.conflictTarget,
            });
            const result = await client.query(toPgPlaceholders(sql), values);
            affectedRows += result.rowCount ?? 0;
            chunkCount += 1;
          }
          await client.query('COMMIT');
        } catch (error) {
          try {
            await client.query('ROLLBACK');
          } catch {
            // ignore rollback failure
          }
          throw error;
        } finally {
          client.release();
        }

        return {
          success: true,
          message: `Inserted ${rows.length} row(s) into ${safeTable} across ${chunkCount} chunk(s)`,
          data: {
            table: safeTable,
            totalRows: rows.length,
            chunkCount,
            chunkSize,
            affectedRows,
            mode: upsert ? 'upsert' : ('insert' as const),
          },
        };
      },
      (result) => result.data?.totalRows
    );
  }

  async tableStats(
    tables?: string[]
  ): Promise<McpToolResult<{ stats: Array<{ table: string; rowCount: number }> }>> {
    return this.runTool('pg_table_stats', async () => {
      let targetTables = tables;
      if (!targetTables || !targetTables.length) {
        const listed = await this.listTables();
        if (!listed.success || !listed.data) {
          return {
            success: false,
            message: listed.message,
            error: listed.error ?? 'TABLE_LIST_FAILED',
          };
        }
        targetTables = listed.data.tables;
      }

      const stats: Array<{ table: string; rowCount: number }> = [];
      for (const table of targetTables) {
        const safeName = assertValidIdentifier(table);
        const quoted = escapeIdentifier(safeName);
        const result = await this.queryWithTimeout<{ row_count: number }>(
          `SELECT COUNT(*)::int AS row_count FROM ${quoted}`
        );
        stats.push({ table: safeName, rowCount: Number(result.rows[0]?.row_count ?? 0) });
      }

      return {
        success: true,
        message: `Fetched row counts for ${stats.length} table(s)`,
        data: { stats },
      };
    });
  }

  async getSchemaResource(): Promise<
    McpToolResult<{ database: string; tables: Array<{ name: string; columns: unknown[] }> }>
  > {
    return this.runTool('pg_schema_resource', async () => {
      const tablesResult = await this.listTables();
      if (!tablesResult.success || !tablesResult.data) {
        return {
          success: false,
          message: tablesResult.message,
          error: tablesResult.error ?? 'SCHEMA_LIST_FAILED',
        };
      }

      const tables = [];
      for (const name of tablesResult.data.tables) {
        const described = await this.describeTable(name);
        tables.push({
          name,
          columns: described.data?.columns ?? [],
        });
      }

      return {
        success: true,
        message: `Schema for ${this.database}`,
        data: { database: this.database, tables },
      };
    });
  }

  private async runTool<T>(
    toolName: string,
    fn: () => Promise<McpToolResult<T>>,
    rowsSelector?: (result: McpToolResult<T>) => number | undefined
  ): Promise<McpToolResult<T>> {
    const started = Date.now();
    try {
      const result = await fn();
      const durationMs = Date.now() - started;
      console.log(
        JSON.stringify({
          scope: 'mcp_pg',
          tool: toolName,
          success: result.success,
          durationMs,
          rows: rowsSelector?.(result),
        })
      );
      return result;
    } catch (error) {
      const durationMs = Date.now() - started;
      const message =
        error instanceof SqlGuardError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unknown MCP Postgres error';

      console.log(
        JSON.stringify({
          scope: 'mcp_pg',
          tool: toolName,
          success: false,
          durationMs,
          error: error instanceof SqlGuardError ? 'SQL_GUARD' : 'EXECUTION',
        })
      );

      return {
        success: false,
        message,
        error: error instanceof SqlGuardError ? 'SQL_GUARD_ERROR' : 'EXECUTION_ERROR',
      };
    }
  }

  private async queryWithTimeout<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    const { queryTimeoutMs } = getMcpConfig();
    const client = await this.pool.connect();
    try {
      await client.query(`SET statement_timeout = ${queryTimeoutMs}`);
      return await client.query<T>(toPgPlaceholders(sql), params);
    } finally {
      try {
        await client.query('SET statement_timeout TO DEFAULT');
      } catch {
        // ignore reset failure; connection is returned to the pool either way
      }
      client.release();
    }
  }
}
