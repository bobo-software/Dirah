import { z } from 'zod';
import { HttpError } from '../../utils/HttpError';
import type { DocsMcpService } from '../../services/DocsMcpService';
import type { PgMcpServerHost } from '../registerPgTools';
import { currentDocsAuth } from './authContext';

function asToolContent(data: unknown, error?: { message: string; code?: string }) {
  if (error) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: error.message, error: error.code }, null, 2) }],
      isError: true,
    };
  }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ success: true, data }, null, 2) }],
  };
}

async function run<T>(tool: string, fn: () => Promise<T>, workspaceId?: string) {
  const auth = currentDocsAuth();
  try {
    const data = await fn();
    void serviceRef?.recordAudit({
      userId: auth.userId,
      tokenId: auth.tokenId,
      workspaceId: workspaceId ?? null,
      tool,
      outcome: 'ok',
    });
    return asToolContent(data);
  } catch (error) {
    const message = error instanceof HttpError ? error.message : error instanceof Error ? error.message : 'MCP tool failed';
    const code = error instanceof HttpError ? error.code : undefined;
    void serviceRef?.recordAudit({
      userId: auth.userId,
      tokenId: auth.tokenId,
      workspaceId: workspaceId ?? null,
      tool,
      outcome: code ?? 'error',
    });
    return asToolContent(null, { message, code });
  }
}

let serviceRef: DocsMcpService | null = null;

export function registerDocsTools(server: PgMcpServerHost, service: DocsMcpService): void {
  serviceRef = service;
  server.registerTool(
    'list_workspaces',
    {
      title: 'List Dira workspaces',
      description: 'List workspaces allowlisted for this MCP token.',
      inputSchema: z.object({}),
    },
    (async () => run('list_workspaces', () => service.listWorkspaces(currentDocsAuth().userId))) as never
  );

  server.registerTool(
    'list_tree',
    {
      title: 'List docs tree',
      description: 'List markdown files and folders in a workspace (BlockSuite pages omitted).',
      inputSchema: z.object({ workspaceId: z.string().uuid() }),
    },
    (async ({ workspaceId }: { workspaceId: string }) =>
      run('list_tree', () => service.listTree(currentDocsAuth().userId, workspaceId), workspaceId)) as never
  );

  server.registerTool(
    'get_node',
    {
      title: 'Get docs node',
      description: 'Get a folder or markdown node by id.',
      inputSchema: z.object({ workspaceId: z.string().uuid(), nodeId: z.string().uuid() }),
    },
    (async ({ workspaceId, nodeId }: { workspaceId: string; nodeId: string }) =>
      run('get_node', () => service.getNode(currentDocsAuth().userId, workspaceId, nodeId), workspaceId)) as never
  );

  server.registerTool(
    'read_file',
    {
      title: 'Read markdown file',
      description: 'Read a markdown document by path (e.g. docs/api/auth.md) or nodeId.',
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        path: z.string().optional(),
        nodeId: z.string().uuid().optional(),
      }),
    },
    (async (args: { workspaceId: string; path?: string; nodeId?: string }) =>
      run('read_file', () => service.readFile(currentDocsAuth().userId, args.workspaceId, args), args.workspaceId)) as never
  );

  server.registerTool(
    'write_file',
    {
      title: 'Write markdown file',
      description: 'Create or replace a markdown file. Creates parent folders by default. Pass hash to avoid clobbering.',
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        path: z.string().min(1),
        content: z.string(),
        createParents: z.boolean().optional(),
        hash: z.string().optional(),
      }),
    },
    (async (args: {
      workspaceId: string;
      path: string;
      content: string;
      createParents?: boolean;
      hash?: string;
    }) => run('write_file', () => service.writeFile(currentDocsAuth().userId, args.workspaceId, args), args.workspaceId)) as never
  );

  server.registerTool(
    'edit_file',
    {
      title: 'Patch markdown file',
      description: 'Replace the first occurrence of oldString with newString. Include hash from read_file.',
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        path: z.string().optional(),
        nodeId: z.string().uuid().optional(),
        oldString: z.string().min(1),
        newString: z.string(),
        hash: z.string().optional(),
      }),
    },
    (async (args: {
      workspaceId: string;
      path?: string;
      nodeId?: string;
      oldString: string;
      newString: string;
      hash?: string;
    }) => run('edit_file', () => service.editFile(currentDocsAuth().userId, args.workspaceId, args), args.workspaceId)) as never
  );

  server.registerTool(
    'create_folder',
    {
      title: 'Create folder',
      description: 'Create a folder path such as docs/api.',
      inputSchema: z.object({ workspaceId: z.string().uuid(), path: z.string().min(1) }),
    },
    (async (args: { workspaceId: string; path: string }) =>
      run('create_folder', () => service.createFolder(currentDocsAuth().userId, args.workspaceId, args), args.workspaceId)) as never
  );

  server.registerTool(
    'rename',
    {
      title: 'Rename docs node',
      description: 'Rename a folder or markdown file (title and/or slug).',
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        path: z.string().optional(),
        nodeId: z.string().uuid().optional(),
        title: z.string().optional(),
        slug: z.string().optional(),
      }),
    },
    (async (args: {
      workspaceId: string;
      path?: string;
      nodeId?: string;
      title?: string;
      slug?: string;
    }) => run('rename', () => service.rename(currentDocsAuth().userId, args.workspaceId, args), args.workspaceId)) as never
  );

  server.registerTool(
    'move',
    {
      title: 'Move docs node',
      description: 'Move a file or folder to another folder (parentPath) or workspace root (parentId null).',
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        path: z.string().optional(),
        nodeId: z.string().uuid().optional(),
        parentPath: z.string().optional(),
        parentId: z.string().uuid().nullable().optional(),
      }),
    },
    (async (args: {
      workspaceId: string;
      path?: string;
      nodeId?: string;
      parentPath?: string;
      parentId?: string | null;
    }) => run('move', () => service.move(currentDocsAuth().userId, args.workspaceId, args), args.workspaceId)) as never
  );

  server.registerTool(
    'delete',
    {
      title: 'Trash docs node',
      description: 'Soft-delete a markdown file or folder (and nested docs) into workspace trash.',
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        path: z.string().optional(),
        nodeId: z.string().uuid().optional(),
      }),
    },
    (async (args: { workspaceId: string; path?: string; nodeId?: string }) =>
      run('delete', () => service.delete(currentDocsAuth().userId, args.workspaceId, args), args.workspaceId)) as never
  );

  server.registerTool(
    'search_docs',
    {
      title: 'Search markdown docs',
      description: 'Full-text search over markdown documents in an allowlisted workspace.',
      inputSchema: z.object({ workspaceId: z.string().uuid(), q: z.string().min(1) }),
    },
    (async (args: { workspaceId: string; q: string }) =>
      run('search_docs', () => service.searchDocs(currentDocsAuth().userId, args.workspaceId, args.q), args.workspaceId)) as never
  );
}
