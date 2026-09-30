import type { RequestHandler } from 'express';
import type { PgMcpService } from '../services/mcp/PgMcpService';
import { registerPgTools, type PgMcpServerHost } from './registerPgTools';

export interface DirahMcpHandlerOptions {
  pg: PgMcpService;
}

/**
 * Build an Express-compatible MCP Streamable HTTP handler.
 * MCP v2 packages are ESM-only; load them via dynamic import from CommonJS.
 */
export async function createDirahMcpExpressHandler(
  options: DirahMcpHandlerOptions
): Promise<RequestHandler> {
  const [{ createMcpHandler, McpServer }, { toNodeHandler }] = await Promise.all([
    import('@modelcontextprotocol/server'),
    import('@modelcontextprotocol/node'),
  ]);

  const handler = createMcpHandler(
    () => {
      const server = new McpServer({
        name: 'dirah-postgres',
        version: '1.0.0',
      });
      const host = server as unknown as PgMcpServerHost;
      registerPgTools(host, options.pg);
      return server;
    },
    {
      legacy: 'stateless',
      responseMode: 'json',
      onerror: (error: Error) => {
        console.error('[mcp]', error.message);
      },
    }
  );

  const node = toNodeHandler(handler);

  return (req, res) => {
    void node(req, res, req.body);
  };
}
