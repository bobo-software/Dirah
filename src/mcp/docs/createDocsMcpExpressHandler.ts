import type { RequestHandler } from 'express';
import type { DocsMcpService } from '../../services/DocsMcpService';
import { registerDocsTools } from './registerDocsTools';
import { docsMcpAuth } from './authContext';
import type { PgMcpServerHost } from '../registerPgTools';

export async function createDocsMcpExpressHandler(service: DocsMcpService): Promise<RequestHandler> {
  const [{ createMcpHandler, McpServer }, { toNodeHandler }] = await Promise.all([
    import('@modelcontextprotocol/server'),
    import('@modelcontextprotocol/node'),
  ]);

  const handler = createMcpHandler(
    () => {
      const server = new McpServer({
        name: 'dira-docs',
        version: '1.0.0',
      });
      registerDocsTools(server as unknown as PgMcpServerHost, service);
      return server;
    },
    {
      legacy: 'stateless',
      responseMode: 'json',
      onerror: (error: Error) => {
        console.error('[mcp-docs]', error.message);
      },
    }
  );

  const node = toNodeHandler(handler);

  return (req, res) => {
    const auth = req.mcpAuth;
    if (!auth) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    docsMcpAuth.run(auth, () => {
      void node(req, res, req.body);
    });
  };
}
