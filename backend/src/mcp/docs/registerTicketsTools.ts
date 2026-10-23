import { z } from 'zod';
import { toolError } from '../../utils/publicError';
import { TICKET_COLORS, TICKET_PRIORITIES, TICKET_STATUS_CATEGORIES } from '../../services/TicketService';
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

type Seen = (workspaceId: string) => void;

function scope(args: WorkspaceArgs, onWorkspace: Seen) {
  return {
    workspaceRef: args.workspaceId ?? args.workspace,
    defaultWorkspaceId: currentDocsAuth().defaultWorkspaceId,
    onWorkspace,
  };
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

/** Runs a tool and audits it against the workspace the service resolved, when it got that far. */
async function run<T>(tool: string, fn: (seen: Seen) => Promise<T>) {
  const auth = currentDocsAuth();
  let workspaceId: string | null = null;
  const seen: Seen = (id) => {
    workspaceId = id;
  };
  try {
    const data = await fn(seen);
    void serviceRef?.recordAudit({ userId: auth.userId, tokenId: auth.tokenId, workspaceId, tool, outcome: 'ok' });
    return asToolContent(data);
  } catch (error) {
    const { message, code, details } = toolError(error);
    void serviceRef?.recordAudit({
      userId: auth.userId,
      tokenId: auth.tokenId,
      workspaceId,
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
      run('list_ticket_boards', (seen) => service.listBoards(auth().userId, auth().tokenId, scope(args, seen)))) as never
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
      run('read_ticket_board', (seen) =>
        service.readBoard(auth().userId, auth().tokenId, { ...scope(args, seen), board: args.board, state: args.state })
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
      run('search_tickets', (seen) => {
        const { workspaceId: _id, workspace: _ws, ...filters } = args;
        return service.search(auth().userId, auth().tokenId, { ...scope(args, seen), ...filters });
      })) as never
  );

  server.registerTool(
    'read_ticket',
    {
      title: 'Read ticket',
      description:
        'Read one ticket by key (e.g. DIRA-12): fields, markdown description, comments (with ids for edit_ticket_comment / delete_ticket_comment), and recent activity. Assignees are shown as emails.',
      inputSchema: z.object({ ...workspaceFields, key: z.string().min(1) }),
    },
    (async (args: WorkspaceArgs & { key: string }) =>
      run('read_ticket', (seen) => service.readTicket(auth().userId, auth().tokenId, { ...scope(args, seen), key: args.key }))) as never
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
      run('create_ticket', (seen) => {
        const { workspaceId: _id, workspace: _ws, ...fields } = args;
        return service.createTicket(auth().userId, auth().tokenId, { ...scope(args, seen), ...fields });
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
      run('update_ticket', (seen) => {
        const { workspaceId: _id, workspace: _ws, ...fields } = args;
        return service.updateTicket(auth().userId, auth().tokenId, { ...scope(args, seen), ...fields });
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
      run('comment_ticket', (seen) =>
        service.comment(auth().userId, auth().tokenId, { ...scope(args, seen), key: args.key, body: args.body })
      )) as never
  );

  const boardRef = z.string().min(1).describe('Board key, e.g. DIRA');
  const ticketKey = z.string().min(1).describe('Ticket key, e.g. DIRA-12');
  const color = z.enum(TICKET_COLORS).optional();
  const position = z.number().int().min(0).optional();

  server.registerTool(
    'create_ticket_board',
    {
      title: 'Create ticket board',
      description:
        'Create a ticket board. key is the ticket prefix (2-10 letters/digits, starting with a letter, e.g. OPS); omit it to derive one from the name. New boards start with statuses To do, In progress, Blocked, Done and one group. Needs editor access.',
      inputSchema: z.object({
        ...workspaceFields,
        name: z.string().min(1).max(120),
        key: z.string().min(2).max(10).optional(),
        description: z.string().max(2_000).nullable().optional(),
      }),
    },
    (async (args: WorkspaceArgs & { name: string; key?: string; description?: string | null }) =>
      run('create_ticket_board', (seen) => {
        const { workspaceId: _id, workspace: _ws, ...fields } = args;
        return service.createBoard(auth().userId, auth().tokenId, { ...scope(args, seen), ...fields });
      })) as never
  );

  server.registerTool(
    'update_ticket_board',
    {
      title: 'Update ticket board',
      description:
        'Rename a board, change its description, or change its key. Changing the key renames every ticket (OLD-3 becomes NEW-3) and breaks old KEY-N references. Needs editor access.',
      inputSchema: z.object({
        ...workspaceFields,
        board: boardRef,
        name: z.string().min(1).max(120).optional(),
        key: z.string().min(2).max(10).optional(),
        description: z.string().max(2_000).nullable().optional(),
      }),
    },
    (async (args: WorkspaceArgs & { board: string; name?: string; key?: string; description?: string | null }) =>
      run('update_ticket_board', (seen) => {
        const { workspaceId: _id, workspace: _ws, ...fields } = args;
        return service.updateBoard(auth().userId, auth().tokenId, { ...scope(args, seen), ...fields });
      })) as never
  );

  server.registerTool(
    'delete_ticket_board',
    {
      title: 'Delete ticket board',
      description:
        'Delete a board and hide all its tickets. There is no restore in the app, so confirm with the user first. Needs editor access.',
      inputSchema: z.object({ ...workspaceFields, board: boardRef }),
    },
    (async (args: WorkspaceArgs & { board: string }) =>
      run('delete_ticket_board', (seen) =>
        service.deleteBoard(auth().userId, auth().tokenId, { ...scope(args, seen), board: args.board })
      )) as never
  );

  server.registerTool(
    'save_ticket_status',
    {
      title: 'Create or update a ticket status',
      description:
        'Create a status on a board, or update the one with this name (case-insensitive). rename changes its name. category drives done/open: todo, doing or done. position is its 0-based place in the status order. Returns the board\'s statuses and groups. Needs editor access.',
      inputSchema: z.object({
        ...workspaceFields,
        board: boardRef,
        name: z.string().min(1).max(60),
        rename: z.string().min(1).max(60).optional(),
        color,
        category: z.enum(TICKET_STATUS_CATEGORIES).optional(),
        position,
      }),
    },
    (async (
      args: WorkspaceArgs & {
        board: string;
        name: string;
        rename?: string;
        color?: string;
        category?: (typeof TICKET_STATUS_CATEGORIES)[number];
        position?: number;
      }
    ) =>
      run('save_ticket_status', (seen) => {
        const { workspaceId: _id, workspace: _ws, ...fields } = args;
        return service.saveStatus(auth().userId, auth().tokenId, { ...scope(args, seen), ...fields });
      })) as never
  );

  server.registerTool(
    'delete_ticket_status',
    {
      title: 'Delete a ticket status',
      description:
        'Delete a status by name. If it still has tickets, moveTo (another status name) is required and they move there. A board keeps at least one status. Needs editor access.',
      inputSchema: z.object({ ...workspaceFields, board: boardRef, name: z.string().min(1), moveTo: z.string().min(1).optional() }),
    },
    (async (args: WorkspaceArgs & { board: string; name: string; moveTo?: string }) =>
      run('delete_ticket_status', (seen) => {
        const { workspaceId: _id, workspace: _ws, ...fields } = args;
        return service.deleteStatus(auth().userId, auth().tokenId, { ...scope(args, seen), ...fields });
      })) as never
  );

  server.registerTool(
    'save_ticket_group',
    {
      title: 'Create or update a ticket group',
      description:
        'Create a group (a section of the table view) on a board, or update the one with this name (case-insensitive). rename changes its name; position is its 0-based place in the group order. Needs editor access.',
      inputSchema: z.object({
        ...workspaceFields,
        board: boardRef,
        name: z.string().min(1).max(60),
        rename: z.string().min(1).max(60).optional(),
        color,
        position,
      }),
    },
    (async (args: WorkspaceArgs & { board: string; name: string; rename?: string; color?: string; position?: number }) =>
      run('save_ticket_group', (seen) => {
        const { workspaceId: _id, workspace: _ws, ...fields } = args;
        return service.saveGroup(auth().userId, auth().tokenId, { ...scope(args, seen), ...fields });
      })) as never
  );

  server.registerTool(
    'delete_ticket_group',
    {
      title: 'Delete a ticket group',
      description:
        'Delete a group by name. Its tickets move to moveTo (a group name), or to the first other group when omitted. A board keeps at least one group. Needs editor access.',
      inputSchema: z.object({ ...workspaceFields, board: boardRef, name: z.string().min(1), moveTo: z.string().min(1).optional() }),
    },
    (async (args: WorkspaceArgs & { board: string; name: string; moveTo?: string }) =>
      run('delete_ticket_group', (seen) => {
        const { workspaceId: _id, workspace: _ws, ...fields } = args;
        return service.deleteGroup(auth().userId, auth().tokenId, { ...scope(args, seen), ...fields });
      })) as never
  );

  server.registerTool(
    'move_ticket',
    {
      title: 'Move or reorder a ticket',
      description:
        'Place a ticket in a list. status + statusPosition set its kanban column and 0-based place in it; group + groupPosition do the same for the table view. Pass either pair or both; omit a position to append. To only change status without ordering, update_ticket is enough. Needs editor access.',
      inputSchema: z.object({
        ...workspaceFields,
        key: ticketKey,
        status: z.string().min(1).optional(),
        statusPosition: position,
        group: z.string().min(1).optional(),
        groupPosition: position,
      }),
    },
    (async (
      args: WorkspaceArgs & { key: string; status?: string; statusPosition?: number; group?: string; groupPosition?: number }
    ) =>
      run('move_ticket', (seen) => {
        const { workspaceId: _id, workspace: _ws, ...fields } = args;
        return service.moveTicket(auth().userId, auth().tokenId, { ...scope(args, seen), ...fields });
      })) as never
  );

  server.registerTool(
    'delete_ticket',
    {
      title: 'Delete ticket',
      description:
        'Delete a ticket by key. There is no restore in the app, so confirm with the user first. Needs editor access.',
      inputSchema: z.object({ ...workspaceFields, key: ticketKey }),
    },
    (async (args: WorkspaceArgs & { key: string }) =>
      run('delete_ticket', (seen) =>
        service.deleteTicket(auth().userId, auth().tokenId, { ...scope(args, seen), key: args.key })
      )) as never
  );

  server.registerTool(
    'edit_ticket_comment',
    {
      title: 'Edit ticket comment',
      description:
        'Replace the body of one of your own comments. commentId comes from read_ticket. Only the author can edit.',
      inputSchema: z.object({
        ...workspaceFields,
        key: ticketKey,
        commentId: z.string().uuid(),
        body: z.string().min(1).max(10_000),
      }),
    },
    (async (args: WorkspaceArgs & { key: string; commentId: string; body: string }) =>
      run('edit_ticket_comment', (seen) => {
        const { workspaceId: _id, workspace: _ws, ...fields } = args;
        return service.editComment(auth().userId, auth().tokenId, { ...scope(args, seen), ...fields });
      })) as never
  );

  server.registerTool(
    'delete_ticket_comment',
    {
      title: 'Delete ticket comment',
      description:
        'Delete a comment by id (from read_ticket). The author, a workspace owner or an admin can delete.',
      inputSchema: z.object({ ...workspaceFields, key: ticketKey, commentId: z.string().uuid() }),
    },
    (async (args: WorkspaceArgs & { key: string; commentId: string }) =>
      run('delete_ticket_comment', (seen) => {
        const { workspaceId: _id, workspace: _ws, ...fields } = args;
        return service.deleteComment(auth().userId, auth().tokenId, { ...scope(args, seen), ...fields });
      })) as never
  );
}
