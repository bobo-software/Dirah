import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import type { PgMcpService, McpToolResult } from '../services/mcp/PgMcpService';

const API_KEY = process.env.MCP_API_KEY || 'test-mcp-api-key';

function mockService(): PgMcpService {
  return {
    listTables: vi.fn(async () => ({
      success: true,
      message: 'Found 1 table(s)',
      data: { tables: ['users'] },
    })),
    describeTable: vi.fn(async (tableName: string) => ({
      success: true,
      message: `Described table ${tableName}`,
      data: { table: tableName, columns: [], indexes: [] },
    })),
    getTableDdl: vi.fn(async (tableName: string) => ({
      success: true,
      message: `Fetched DDL for ${tableName}`,
      data: { table: tableName, ddl: `CREATE TABLE ${tableName} (id INT)` },
    })),
    select: vi.fn(async () => ({
      success: true,
      message: 'Returned 1 row(s)',
      data: { rows: [{ id: 1 }], rowCount: 1, appliedLimit: 100, sql: 'SELECT 1 LIMIT 100' },
    })),
    executeWrite: vi.fn(async (_sql: string, options: { confirm: boolean }) => {
      if (!options.confirm) {
        return {
          success: false,
          message: 'Writes require confirm: true',
          error: 'SQL_GUARD_ERROR',
        } satisfies McpToolResult;
      }
      return {
        success: true,
        message: 'Executed INSERT',
        data: { kind: 'insert', affectedRows: 1, sql: 'INSERT ...' },
      };
    }),
    getSchemaResource: vi.fn(async () => ({
      success: true,
      message: 'Schema for dirah',
      data: { database: 'dirah', tables: [{ name: 'users', columns: [] }] },
    })),
    migrationStatus: vi.fn(async () => ({
      success: true,
      message: 'All 2 migration(s) applied',
      data: {
        migrationsTable: '__drizzle_migrations',
        tableExists: true,
        folderMissing: false,
        totalEntries: 2,
        appliedCount: 2,
        pendingCount: 0,
        lastAppliedTag: '0000_init',
        lastAppliedAt: 123,
        entries: [],
        inSync: true,
      },
    })),
    runMigrations: vi.fn(async (options: { confirm: boolean }) => {
      if (!options.confirm) {
        return {
          success: false,
          message: 'Running migrations requires confirm: true',
          error: 'SQL_GUARD_ERROR',
        } satisfies McpToolResult;
      }
      return {
        success: true,
        message: 'No pending migrations',
        data: {
          ranMigrations: false,
          appliedTags: [],
          before: { appliedCount: 2, pendingCount: 0, pendingTags: [] },
          after: { appliedCount: 2, pendingCount: 0, pendingTags: [] },
          durationMs: 5,
        },
      };
    }),
    bulkInsert: vi.fn(async (_tableName: string, _rows: unknown[], options: { confirm: boolean }) => {
      if (!options.confirm) {
        return {
          success: false,
          message: 'Bulk insert requires confirm: true',
          error: 'SQL_GUARD_ERROR',
        } satisfies McpToolResult;
      }
      return {
        success: true,
        message: 'Inserted 1 row(s) into users across 1 chunk(s)',
        data: {
          table: 'users',
          totalRows: 1,
          chunkCount: 1,
          chunkSize: 200,
          affectedRows: 1,
          mode: 'insert',
        },
      };
    }),
    tableStats: vi.fn(async () => ({
      success: true,
      message: 'Fetched row counts for 1 table(s)',
      data: { stats: [{ table: 'users', rowCount: 1 }] },
    })),
  } as unknown as PgMcpService;
}

function parseMcpBody(body: unknown): Record<string, unknown> {
  if (typeof body === 'object' && body !== null) {
    return body as Record<string, unknown>;
  }
  if (typeof body === 'string') {
    const dataLine = body.split('\n').find((line) => line.startsWith('data: '));
    if (dataLine) {
      return JSON.parse(dataLine.slice('data: '.length)) as Record<string, unknown>;
    }
    return JSON.parse(body) as Record<string, unknown>;
  }
  throw new Error(`Unexpected MCP body type: ${typeof body}`);
}

async function mcpPost(
  app: Express,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  return request(app)
    .post('/mcp/protocol')
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json, text/event-stream')
    .set(headers)
    .send(payload);
}

describe('MCP protocol endpoint', () => {
  let app: Express;
  let service: PgMcpService;

  beforeAll(async () => {
    process.env.MCP_API_KEY = API_KEY;
    service = mockService();
    app = await createApp({
      pgMcpService: service,
    });
  });

  it('rejects missing API key', async () => {
    const res = await mcpPost(app, {
      jsonrpc: '2.0',
      id: 1,
      method: 'ping',
    });
    expect(res.status).toBe(401);
  });

  it('rejects wrong API key', async () => {
    const res = await mcpPost(
      app,
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { Authorization: 'Bearer wrong-key' }
    );
    expect(res.status).toBe(401);
  });

  it('initializes with a valid API key', async () => {
    const res = await mcpPost(
      app,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'dirah-tests', version: '1.0.0' },
        },
      },
      { Authorization: `Bearer ${API_KEY}` }
    );

    expect(res.status).toBe(200);
    const body = parseMcpBody(res.body?.result ? res.body : res.text);
    const result = (body.result ?? body) as Record<string, unknown>;
    expect(result).toBeTruthy();
  });

  it('lists Postgres tools', async () => {
    const res = await mcpPost(
      app,
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { Authorization: `Bearer ${API_KEY}` }
    );

    expect(res.status).toBe(200);
    const body = parseMcpBody(res.body?.result ? res.body : res.text);
    const result = (body.result ?? body) as { tools?: Array<{ name: string }> };
    const names = (result.tools ?? []).map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'pg_list_tables',
        'pg_describe_table',
        'pg_get_table_ddl',
        'pg_select',
        'pg_execute_write',
        'pg_migration_status',
        'pg_run_migrations',
        'pg_bulk_insert',
        'pg_table_stats',
      ])
    );
  });

  it('lists schema resource', async () => {
    const res = await mcpPost(
      app,
      { jsonrpc: '2.0', id: 3, method: 'resources/list' },
      { Authorization: `Bearer ${API_KEY}` }
    );

    expect(res.status).toBe(200);
    const body = parseMcpBody(res.body?.result ? res.body : res.text);
    const result = (body.result ?? body) as {
      resources?: Array<{ uri: string }>;
    };
    const uris = (result.resources ?? []).map((resource) => resource.uri);
    expect(uris).toContain('postgres://schema');
  });

  it('calls pg_list_tables', async () => {
    const res = await mcpPost(
      app,
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'pg_list_tables', arguments: {} },
      },
      { Authorization: `Bearer ${API_KEY}` }
    );

    expect(res.status).toBe(200);
    const body = parseMcpBody(res.body?.result ? res.body : res.text);
    const result = (body.result ?? body) as {
      content?: Array<{ text?: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content?.[0]?.text ?? '{}') as McpToolResult;
    expect(payload.success).toBe(true);
    expect(service.listTables).toHaveBeenCalled();
  });

  it('rejects unconfirmed writes via tool call', async () => {
    const res = await mcpPost(
      app,
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'pg_execute_write',
          arguments: {
            sql: 'INSERT INTO users (id) VALUES (1)',
            confirm: false,
          },
        },
      },
      { Authorization: `Bearer ${API_KEY}` }
    );

    expect(res.status).toBe(200);
    const body = parseMcpBody(res.body?.result ? res.body : res.text);
    const result = (body.result ?? body) as {
      content?: Array<{ text?: string }>;
      isError?: boolean;
    };
    const payload = JSON.parse(result.content?.[0]?.text ?? '{}') as McpToolResult;
    expect(payload.success).toBe(false);
    expect(payload.message).toMatch(/confirm/i);
  });

  it('calls pg_migration_status', async () => {
    const res = await mcpPost(
      app,
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'pg_migration_status', arguments: {} },
      },
      { Authorization: `Bearer ${API_KEY}` }
    );

    expect(res.status).toBe(200);
    const body = parseMcpBody(res.body?.result ? res.body : res.text);
    const result = (body.result ?? body) as {
      content?: Array<{ text?: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content?.[0]?.text ?? '{}') as McpToolResult;
    expect(payload.success).toBe(true);
    expect(service.migrationStatus).toHaveBeenCalled();
  });

  it('rejects unconfirmed pg_run_migrations', async () => {
    const res = await mcpPost(
      app,
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name: 'pg_run_migrations', arguments: { confirm: false } },
      },
      { Authorization: `Bearer ${API_KEY}` }
    );

    expect(res.status).toBe(200);
    const body = parseMcpBody(res.body?.result ? res.body : res.text);
    const result = (body.result ?? body) as {
      content?: Array<{ text?: string }>;
      isError?: boolean;
    };
    const payload = JSON.parse(result.content?.[0]?.text ?? '{}') as McpToolResult;
    expect(payload.success).toBe(false);
    expect(payload.message).toMatch(/confirm/i);
  });

  it('rejects unconfirmed pg_bulk_insert', async () => {
    const res = await mcpPost(
      app,
      {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'pg_bulk_insert',
          arguments: { tableName: 'users', rows: [{ id: 1 }], confirm: false },
        },
      },
      { Authorization: `Bearer ${API_KEY}` }
    );

    expect(res.status).toBe(200);
    const body = parseMcpBody(res.body?.result ? res.body : res.text);
    const result = (body.result ?? body) as {
      content?: Array<{ text?: string }>;
      isError?: boolean;
    };
    const payload = JSON.parse(result.content?.[0]?.text ?? '{}') as McpToolResult;
    expect(payload.success).toBe(false);
    expect(payload.message).toMatch(/confirm/i);
  });

  it('calls pg_table_stats', async () => {
    const res = await mcpPost(
      app,
      {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: { name: 'pg_table_stats', arguments: {} },
      },
      { Authorization: `Bearer ${API_KEY}` }
    );

    expect(res.status).toBe(200);
    const body = parseMcpBody(res.body?.result ? res.body : res.text);
    const result = (body.result ?? body) as {
      content?: Array<{ text?: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content?.[0]?.text ?? '{}') as McpToolResult;
    expect(payload.success).toBe(true);
    expect(service.tableStats).toHaveBeenCalled();
  });
});
