import './env';

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name}: expected a positive integer`);
  }
  return value;
}

export interface McpConfig {
  apiKey: string | undefined;
  defaultSelectLimit: number;
  maxSelectLimit: number;
  maxWriteLimit: number;
  queryTimeoutMs: number;
  poolLimit: number;
  migrationTimeoutMs: number;
  maxBulkInsertRows: number;
}

export function getMcpConfig(): McpConfig {
  const defaultSelectLimit = intEnv('MCP_PG_DEFAULT_SELECT_LIMIT', 100);
  const maxSelectLimit = intEnv('MCP_PG_MAX_SELECT_LIMIT', 1000);
  const maxWriteLimit = intEnv('MCP_PG_MAX_WRITE_LIMIT', 1000);
  const queryTimeoutMs = intEnv('MCP_PG_QUERY_TIMEOUT_MS', 15_000);
  const poolLimit = intEnv('MCP_PG_POOL_LIMIT', 10);
  const migrationTimeoutMs = intEnv('MCP_PG_MIGRATION_TIMEOUT_MS', 300_000);
  const maxBulkInsertRows = intEnv('MCP_PG_MAX_BULK_INSERT_ROWS', 5_000);

  if (defaultSelectLimit > maxSelectLimit) {
    throw new Error(
      'MCP_PG_DEFAULT_SELECT_LIMIT cannot exceed MCP_PG_MAX_SELECT_LIMIT'
    );
  }

  return {
    apiKey: process.env.MCP_API_KEY || undefined,
    defaultSelectLimit,
    maxSelectLimit,
    maxWriteLimit,
    queryTimeoutMs,
    poolLimit,
    migrationTimeoutMs,
    maxBulkInsertRows,
  };
}
