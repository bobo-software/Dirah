import { z } from 'zod';
import { HttpError } from '../../utils/HttpError';
import { TICKET_PRIORITIES, TICKET_STATUS_CATEGORIES } from '../../services/TicketService';
import type { TicketsMcpService } from '../../services/TicketsMcpService';
import type { PgMcpServerHost } from '../registerPgTools';
import { currentDocsAuth } from './authContext';

const workspaceFields = {
  workspaceId: z.string().uuid().optional(),
  workspace: z.string().min(1).optional(),
};

const ticketFields = {
  description: z.string().max(50_000).optional(),
  status: z.string().min(1).optional(),
  group: z.string().min(1).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assignees: z.array(z.string().min(1)).max(50).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  labels: z.array(z.string().max(40)).max(20).optional(),
};

type WorkspaceArgs = { workspaceId?: string; workspace?: string };
type TicketArgs = WorkspaceArgs & {
  description?: string;
  status?: string;
  group?: string;
  priority?: (typeof TICKET_PRIORITIES)[number];
  assignees?: string[];
  dueDate?: string | null;
  labels?: string[];
};

function scope(args: WorkspaceArgs) {
  return { workspaceRef: args.workspaceId ?? args.workspace, defaultWorkspaceId: currentDocsAuth().defaultWorkspaceId };
}

function asToolContent(
  data: unknown,
  error?: { message: string; code?: string; details?: Record<string, unknown> }
) {
  if (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            { success: false, message: error.message, error: error.code, details: error.details },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ success: true, data }, null, 2) }],
  };
}

let serviceRef: TicketsMcpService | null = null;

async function run<T>(tool: string, fn: () => Promise<T>) {
  const auth = currentDocsAuth();
  try {
    const data = await fn();
    void serviceRef?.recordAudit({ userId: auth.userId, tokenId: auth.tokenId, workspaceId: null, tool, outcome: 'ok' });
    return asToolContent(data);
  } catch (error) {
    const message = error instanceof HttpError ? error.message : error instanceof Error ? error.message : 'MCP tool failed';
    const code = error instanceof HttpError ? error.code : undefined;
    const details = error instanceof HttpError ? error.details : undefined;
    void serviceRef?.recordAudit({
      userId: auth.userId,
      tokenId: auth.tokenId,
      workspaceId: null,
      tool,
      outcome: code ?? 'error',
    });
    return asToolContent(null, { message, code, details });
  }
}

export function registerTicketsTools(server: PgMcpServerHost, service: TicketsMcpService): void {
  serviceRef = service;
  const auth = () => currentDocsAuth();

  server.registerTool(
    'list_ticket_boards',
    {
      title: 'List ticket boards',
      description: 'List ticket boards in a workspace: key (ticket prefix, e.g. DIRA), name, ticketCount, openCount.',
      inputSchema: z.object({ ...workspaceFields }),
    },
    (async (args: WorkspaceArgs) =>
      run('list_ticket_boards', () => service.listBoards(auth().userId, auth().tokenId, scope(args)))) as never
  );

  server.registerTool(
    'read_ticket_board',
    {
      title: 'Read ticket board',
      description:
        'Read a ticket board by key (e.g. DIRA). Returns its statuses (with category todo/doing/done), groups, and tickets as compact rows. By default only open tickets (status category not done); pass state "all" to include done.',
      inputSchema: z.object({
        ...workspaceFields,
        board: z.string().min(1),
        state: z.enum(['open', 'all']).optional(),
      }),
    },
    (async (args: WorkspaceArgs & { board: string; state?: 'open' | 'all' }) =>
      run('read_ticket_board', () =>
        service.readBoard(auth().userId, auth().tokenId, { ...scope(args), board: args.board, state: args.state })
      )) as never
  );

  server.registerTool(
    'search_tickets',
    {
      title: 'Search tickets',
      description:
        'Search tickets across boards. q matches title, description, labels, or a ticket key (DIRA-12). Filter by board key, status name, assignee (email or "me"), or state (todo, doing, done, open). Up to 200 rows, soonest due first.',
      inputSchema: z.object({
        ...workspaceFields,
        q: z.string().max(200).optional(),
        board: z.string().min(1).optional(),
        status: z.string().min(1).optional(),
        assignee: z.string().min(1).optional(),
        state: z.enum([...TICKET_STATUS_CATEGORIES, 'open']).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    },
    (async (
      args: WorkspaceArgs & {
        q?: string;
        board?: string;
        status?: string;
        assignee?: string;
        state?: (typeof TICKET_STATUS_CATEGORIES)[number] | 'open';
        limit?: number;
      }
    ) =>
      run('search_tickets', () => {
        const { workspaceId: _id, workspace: _ws, ...filters } = args;
        return service.search(auth().userId, auth().tokenId, { ...scope(args), ...filters });
      })) as never
  );

  server.registerTool(
    'read_ticket',
    {
      title: 'Read ticket',
      description:
        'Read one ticket by key (e.g. DIRA-12): fields, markdown description, comments, and recent activity. Assignees are shown as emails.',
      inputSchema: z.object({ ...workspaceFields, key: z.string().min(1) }),
    },
    (async (args: WorkspaceArgs & { key: string }) =>
      run('read_ticket', () => service.readTicket(auth().userId, auth().tokenId, { ...scope(args), key: args.key }))) as never
  );

  server.registerTool(
    'create_ticket',
    {
      title: 'Create ticket',
      description:
        'Create a ticket on a board (by board key). status and group are names (case-insensitive); omit them for the first status/group. assignees are member emails. dueDate is YYYY-MM-DD. Needs editor access. Returns the new ticket with its key.',
      inputSchema: z.object({
        ...workspaceFields,
        board: z.string().min(1),
        title: z.string().min(1).max(300),
        ...ticketFields,
      }),
    },
    (async (args: TicketArgs & { board: string; title: string }) =>
      run('create_ticket', () => {
        const { workspaceId: _id, workspace: _ws, ...fields } = args;
        return service.createTicket(auth().userId, auth().tokenId, { ...scope(args), ...fields });
      })) as never
  );

  server.registerTool(
    'update_ticket',
    {
      title: 'Update ticket',
      description:
        'Update a ticket by key. Only the fields you pass change. status/group by name; assignees (member emails) replaces the whole list; dueDate null clears it; labels replaces the list; description replaces the markdown body. Needs editor access.',
      inputSchema: z.object({
        ...workspaceFields,
        key: z.string().min(1),
        title: z.string().min(1).max(300).optional(),
        ...ticketFields,
      }),
    },
    (async (args: TicketArgs & { key: string; title?: string }) =>
      run('update_ticket', () => {
        const { workspaceId: _id, workspace: _ws, ...fields } = args;
        return service.updateTicket(auth().userId, auth().tokenId, { ...scope(args), ...fields });
      })) as never
  );

  server.registerTool(
    'comment_ticket',
    {
      title: 'Comment on ticket',
      description: 'Add a markdown comment to a ticket by key. Needs editor access.',
      inputSchema: z.object({ ...workspaceFields, key: z.string().min(1), body: z.string().min(1).max(10_000) }),
    },
    (async (args: WorkspaceArgs & { key: string; body: string }) =>
      run('comment_ticket', () =>
        service.comment(auth().userId, auth().tokenId, { ...scope(args), key: args.key, body: args.body })
      )) as never
  );
}
