import { z } from 'zod';
import { HttpError } from '../../utils/HttpError';
import type { DocsMcpService } from '../../services/DocsMcpService';
import type { PgMcpServerHost } from '../registerPgTools';
import { currentDocsAuth } from './authContext';
import { DIRA_DOCS_INSTRUCTIONS } from './instructions';

const workspaceFields = {
  workspaceId: z.string().uuid().optional(),
  workspace: z.string().min(1).optional(),
};

function workspaceRef(args: { workspaceId?: string; workspace?: string }): string | undefined {
  return args.workspaceId ?? args.workspace;
}

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

async function run<T>(tool: string, fn: () => Promise<T>, workspaceId?: string | null) {
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

async function requireWorkspace(args: { workspaceId?: string; workspace?: string }) {
  const auth = currentDocsAuth();
  const resolved = await serviceRef!.resolveWorkspace(auth.userId, workspaceRef(args));
  if (!resolved) {
    throw new HttpError('workspace or workspaceId is required', 400, 'WORKSPACE_REQUIRED');
  }
  return resolved;
}

function inWorkspace<T>(
  tool: string,
  args: { workspaceId?: string; workspace?: string },
  fn: (workspaceId: string) => Promise<T>
) {
  return run(tool, async () => {
    const ws = await requireWorkspace(args);
    return fn(ws.workspaceId);
  });
}

export function registerDocsTools(server: PgMcpServerHost, service: DocsMcpService): void {
  serviceRef = service;
  server.registerTool(
    'dira_guide',
    {
      title: 'How to use Dira docs MCP',
      description: 'Short instructions for coding agents: search first, omit workspace when the token has one workspace, pass hash on writes.',
      inputSchema: z.object({}),
    },
    (async () => run('dira_guide', async () => ({ instructions: DIRA_DOCS_INSTRUCTIONS }))) as never
  );

  server.registerTool(
    'list_workspaces',
    {
      title: 'List Dira workspaces',
      description: 'List workspaces allowlisted for this MCP token. Includes slug (use as workspace) and default when only one is allowlisted.',
      inputSchema: z.object({}),
    },
    (async () => run('list_workspaces', () => service.listWorkspaces(currentDocsAuth().userId))) as never
  );

  server.registerTool(
    'list_tree',
    {
      title: 'List docs tree',
      description: 'List markdown files and folders. Optional prefix (e.g. docs/api) and depth. Omit workspace when the token has one workspace.',
      inputSchema: z.object({
        ...workspaceFields,
        prefix: z.string().optional(),
        depth: z.number().int().min(1).optional(),
      }),
    },
    (async (args: { workspaceId?: string; workspace?: string; prefix?: string; depth?: number }) =>
      inWorkspace('list_tree', args, (workspaceId) =>
        service.listTree(currentDocsAuth().userId, workspaceId, { prefix: args.prefix, depth: args.depth })
      )) as never
  );

  server.registerTool(
    'get_node',
    {
      title: 'Get docs node',
      description: 'Get a folder or markdown node by id.',
      inputSchema: z.object({ ...workspaceFields, nodeId: z.string().uuid() }),
    },
    (async (args: { workspaceId?: string; workspace?: string; nodeId: string }) =>
      inWorkspace('get_node', args, (workspaceId) =>
        service.getNode(currentDocsAuth().userId, workspaceId, args.nodeId)
      )) as never
  );

  server.registerTool(
    'read_file',
    {
      title: 'Read markdown file',
      description: 'Read a markdown document by path or nodeId. Optional startLine (1-based) and maxLines. Omit workspace when the token has one workspace.',
      inputSchema: z.object({
        ...workspaceFields,
        path: z.string().optional(),
        nodeId: z.string().uuid().optional(),
        startLine: z.number().int().min(1).optional(),
        maxLines: z.number().int().min(1).optional(),
      }),
    },
    (async (args: {
      workspaceId?: string;
      workspace?: string;
      path?: string;
      nodeId?: string;
      startLine?: number;
      maxLines?: number;
    }) =>
      inWorkspace('read_file', args, (workspaceId) =>
        service.readFile(currentDocsAuth().userId, workspaceId, args)
      )) as never
  );

  server.registerTool(
    'write_file',
    {
      title: 'Write markdown file',
      description: 'Create or replace a markdown file. Creates parent folders by default. Pass hash to avoid clobbering. Omit workspace when the token has one workspace.',
      inputSchema: z.object({
        ...workspaceFields,
        path: z.string().min(1),
        content: z.string(),
        createParents: z.boolean().optional(),
        hash: z.string().optional(),
      }),
    },
    (async (args: {
      workspaceId?: string;
      workspace?: string;
      path: string;
      content: string;
      createParents?: boolean;
      hash?: string;
    }) =>
      inWorkspace('write_file', args, (workspaceId) =>
        service.writeFile(currentDocsAuth().userId, workspaceId, args)
      )) as never
  );

  server.registerTool(
    'edit_file',
    {
      title: 'Patch markdown file',
      description: 'Replace the first occurrence of oldString with newString. Include hash from read_file.',
      inputSchema: z.object({
        ...workspaceFields,
        path: z.string().optional(),
        nodeId: z.string().uuid().optional(),
        oldString: z.string().min(1),
        newString: z.string(),
        hash: z.string().optional(),
      }),
    },
    (async (args: {
      workspaceId?: string;
      workspace?: string;
      path?: string;
      nodeId?: string;
      oldString: string;
      newString: string;
      hash?: string;
    }) =>
      inWorkspace('edit_file', args, (workspaceId) =>
        service.editFile(currentDocsAuth().userId, workspaceId, args)
      )) as never
  );

  server.registerTool(
    'create_folder',
    {
      title: 'Create folder',
      description: 'Create a folder path such as docs/api.',
      inputSchema: z.object({ ...workspaceFields, path: z.string().min(1) }),
    },
    (async (args: { workspaceId?: string; workspace?: string; path: string }) =>
      inWorkspace('create_folder', args, (workspaceId) =>
        service.createFolder(currentDocsAuth().userId, workspaceId, args)
      )) as never
  );

  server.registerTool(
    'rename',
    {
      title: 'Rename docs node',
      description: 'Rename a folder or markdown file (title and/or slug).',
      inputSchema: z.object({
        ...workspaceFields,
        path: z.string().optional(),
        nodeId: z.string().uuid().optional(),
        title: z.string().optional(),
        slug: z.string().optional(),
      }),
    },
    (async (args: {
      workspaceId?: string;
      workspace?: string;
      path?: string;
      nodeId?: string;
      title?: string;
      slug?: string;
    }) =>
      inWorkspace('rename', args, (workspaceId) =>
        service.rename(currentDocsAuth().userId, workspaceId, args)
      )) as never
  );

  server.registerTool(
    'move',
    {
      title: 'Move docs node',
      description: 'Move a file or folder to another folder (parentPath) or workspace root (parentId null).',
      inputSchema: z.object({
        ...workspaceFields,
        path: z.string().optional(),
        nodeId: z.string().uuid().optional(),
        parentPath: z.string().optional(),
        parentId: z.string().uuid().nullable().optional(),
      }),
    },
    (async (args: {
      workspaceId?: string;
      workspace?: string;
      path?: string;
      nodeId?: string;
      parentPath?: string;
      parentId?: string | null;
    }) =>
      inWorkspace('move', args, (workspaceId) =>
        service.move(currentDocsAuth().userId, workspaceId, args)
      )) as never
  );

  server.registerTool(
    'delete',
    {
      title: 'Trash docs node',
      description: 'Soft-delete a markdown file or folder (and nested docs) into workspace trash.',
      inputSchema: z.object({
        ...workspaceFields,
        path: z.string().optional(),
        nodeId: z.string().uuid().optional(),
      }),
    },
    (async (args: { workspaceId?: string; workspace?: string; path?: string; nodeId?: string }) =>
      inWorkspace('delete', args, (workspaceId) =>
        service.delete(currentDocsAuth().userId, workspaceId, args)
      )) as never
  );

  server.registerTool(
    'search_docs',
    {
      title: 'Search markdown docs',
      description:
        'Full-text search with snippets and app URLs. Omit workspace to search all allowlisted workspaces. Omit workspaceId when the token has one workspace.',
      inputSchema: z.object({
        ...workspaceFields,
        q: z.string().min(1),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    },
    (async (args: { workspaceId?: string; workspace?: string; q: string; limit?: number }) =>
      run('search_docs', () =>
        service.searchDocs(currentDocsAuth().userId, workspaceRef(args), args.q, args.limit)
      )) as never
  );
}
