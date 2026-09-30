import { beforeAll } from 'vitest';

process.env.MCP_API_KEY ??= 'test-mcp-api-key';
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.DB_HOST ??= '127.0.0.1';
process.env.DB_PORT ??= '5432';
process.env.DB_DATABASE ??= 'dirah_test';
process.env.DB_USERNAME ??= 'dirah_test';
process.env.DB_PASSWORD ??= 'dirah_test';
process.env.MCP_PG_DEFAULT_SELECT_LIMIT ??= '100';
process.env.MCP_PG_MAX_SELECT_LIMIT ??= '1000';
process.env.MCP_PG_MAX_WRITE_LIMIT ??= '1000';
process.env.MCP_PG_QUERY_TIMEOUT_MS ??= '15000';
process.env.BLOB_DIR ??= `${process.cwd()}/.tmp-blobs`;
process.env.DOC_SNAPSHOT_EVERY ??= '3';

beforeAll(() => {
  if (!process.env.MCP_API_KEY) {
    process.env.MCP_API_KEY = 'test-mcp-api-key';
  }
});
