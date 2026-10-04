import { z } from 'zod';
import { HttpError } from '../../utils/HttpError';
import type { NotesMcpService } from '../../services/NotesMcpService';
import type { PgMcpServerHost } from '../registerPgTools';
import { currentDocsAuth } from './authContext';

const workspaceFields = {
  workspaceId: z.string().uuid().optional(),
  workspace: z.string().min(1).optional(),
};

const patchSchema = z.object({
  oldString: z.string().min(1),
  newString: z.string(),
  replaceAll: z.boolean().optional(),
});

function workspaceRef(args: { workspaceId?: string; workspace?: string }): string | undefined {
  return args.workspaceId ?? args.workspace;
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

let serviceRef: NotesMcpService | null = null;

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
    const details = error instanceof HttpError ? error.details : undefined;
    void serviceRef?.recordAudit({
      userId: auth.userId,
      tokenId: auth.tokenId,
      workspaceId: workspaceId ?? null,
      tool,
      outcome: code ?? 'error',
    });
    return asToolContent(null, { message, code, details });
  }
}

export function registerNotesTools(server: PgMcpServerHost, service: NotesMcpService): void {
  serviceRef = service;

  server.registerTool(
    'list_notes',
    {
      title: 'List notes',
      description:
        "List notes visible to this token's user: their private notes and workspace-shared notes. Optional scope (mine or shared), parentId (uuid, or null for top-level), and q. Page tools do not return notes.",
      inputSchema: z.object({
        ...workspaceFields,
        scope: z.enum(['mine', 'shared']).optional(),
        parentId: z.string().uuid().nullable().optional(),
        q: z.string().min(1).optional(),
      }),
    },
    (async (args: {
      workspaceId?: string;
      workspace?: string;
      scope?: 'mine' | 'shared';
      parentId?: string | null;
      q?: string;
    }) =>
      run('list_notes', () =>
        service.listNotes(currentDocsAuth().userId, currentDocsAuth().tokenId, workspaceRef(args), {
          defaultWorkspaceId: currentDocsAuth().defaultWorkspaceId,
          scope: args.scope,
          parentId: args.parentId,
          q: args.q,
        })
      )) as never
  );

  server.registerTool(
    'read_note',
    {
      title: 'Read note',
      description:
        'Read a note by noteId. Returns markdown, hash, and a web url. Optional startLine (1-based) and maxLines. Invisible notes are 404.',
      inputSchema: z.object({
        ...workspaceFields,
        noteId: z.string().uuid(),
        startLine: z.number().int().min(1).optional(),
        maxLines: z.number().int().min(1).optional(),
      }),
    },
    (async (args: {
      workspaceId?: string;
      workspace?: string;
      noteId: string;
      startLine?: number;
      maxLines?: number;
    }) =>
      run('read_note', () =>
        service.readNote(currentDocsAuth().userId, currentDocsAuth().tokenId, args.noteId, {
          workspaceRef: workspaceRef(args),
          startLine: args.startLine,
          maxLines: args.maxLines,
        })
      )) as never
  );

  server.registerTool(
    'search_notes',
    {
      title: 'Search notes',
      description:
        "Full-text search over notes the token's user can see. Plain-text snippets. Accepts q or query. Omit workspace to search all allowlisted workspaces. Does not search pages.",
      inputSchema: z.object({
        ...workspaceFields,
        q: z.string().min(1).optional(),
        query: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    },
    (async (args: {
      workspaceId?: string;
      workspace?: string;
      q?: string;
      query?: string;
      limit?: number;
    }) =>
      run('search_notes', async () => {
        const term = args.q ?? args.query;
        if (!term) {
          throw new HttpError('q or query is required', 400, 'INVALID_ARGS');
        }
        return service.searchNotes(
          currentDocsAuth().userId,
          currentDocsAuth().tokenId,
          workspaceRef(args),
          term,
          args.limit
        );
      })) as never
  );

  server.registerTool(
    'write_note',
    {
      title: 'Write note',
      description:
        'Create a note (title, optional parentId, visibility, content) or replace one (noteId, content, hash). Author only. Pass hash from read_note to avoid clobbering. Stale hash returns HASH_MISMATCH. Link other notes with [[Label|noteId]].',
      inputSchema: z.object({
        ...workspaceFields,
        noteId: z.string().uuid().optional(),
        title: z.string().optional(),
        parentId: z.string().uuid().nullable().optional(),
        visibility: z.enum(['private', 'workspace']).optional(),
        content: z.string().optional(),
        hash: z.string().optional(),
      }),
    },
    (async (args: {
      workspaceId?: string;
      workspace?: string;
      noteId?: string;
      title?: string;
      parentId?: string | null;
      visibility?: 'private' | 'workspace';
      content?: string;
      hash?: string;
    }) =>
      run('write_note', () =>
        service.writeNote(currentDocsAuth().userId, currentDocsAuth().tokenId, {
          workspaceRef: workspaceRef(args),
          defaultWorkspaceId: currentDocsAuth().defaultWorkspaceId,
          noteId: args.noteId,
          title: args.title,
          parentId: args.parentId,
          visibility: args.visibility,
          content: args.content,
          hash: args.hash,
        })
      )) as never
  );

  server.registerTool(
    'edit_note',
    {
      title: 'Patch note',
      description:
        'Replace oldString with newString, apply patches[] in order, or append. Include hash from read_note. Author only. Failed patches return currentHash and a nearbySnippet.',
      inputSchema: z.object({
        ...workspaceFields,
        noteId: z.string().uuid(),
        oldString: z.string().min(1).optional(),
        newString: z.string().optional(),
        hash: z.string().optional(),
        replaceAll: z.boolean().optional(),
        patches: z.array(patchSchema).min(1).optional(),
        append: z.string().min(1).optional(),
      }),
    },
    (async (args: {
      workspaceId?: string;
      workspace?: string;
      noteId: string;
      oldString?: string;
      newString?: string;
      hash?: string;
      replaceAll?: boolean;
      patches?: { oldString: string; newString: string; replaceAll?: boolean }[];
      append?: string;
    }) =>
      run('edit_note', () =>
        service.editNote(currentDocsAuth().userId, currentDocsAuth().tokenId, {
          ...args,
          workspaceRef: workspaceRef(args),
        })
      )) as never
  );

  server.registerTool(
    'update_note',
    {
      title: 'Update note',
      description:
        "Change a note's title, icon, cover, parent, position, visibility, or pinned flag. Author only. Visibility follows the parent and cascades to descendants.",
      inputSchema: z.object({
        ...workspaceFields,
        noteId: z.string().uuid(),
        title: z.string().optional(),
        icon: z.string().nullable().optional(),
        cover: z.string().nullable().optional(),
        parentId: z.string().uuid().nullable().optional(),
        position: z.number().int().optional(),
        visibility: z.enum(['private', 'workspace']).optional(),
        pinned: z.boolean().optional(),
      }),
    },
    (async (args: {
      workspaceId?: string;
      workspace?: string;
      noteId: string;
      title?: string;
      icon?: string | null;
      cover?: string | null;
      parentId?: string | null;
      position?: number;
      visibility?: 'private' | 'workspace';
      pinned?: boolean;
    }) =>
      run('update_note', () =>
        service.updateNote(currentDocsAuth().userId, currentDocsAuth().tokenId, {
          ...args,
          workspaceRef: workspaceRef(args),
        })
      )) as never
  );

  server.registerTool(
    'create_linked_notes',
    {
      title: 'Create linked notes',
      description:
        'Create one sub-note per entry under a note and append a list linking to each ([[Title|noteId]]). Use for "make a list of X with a note for each". Pass noteId (+ hash from read_note) to add to an existing note, or title (+ optional parentId, visibility, content) to create the list note too. Author only. Returns the updated note and each new note\'s id, link, and url.',
      inputSchema: z.object({
        ...workspaceFields,
        noteId: z.string().uuid().optional(),
        hash: z.string().optional(),
        title: z.string().optional(),
        parentId: z.string().uuid().nullable().optional(),
        visibility: z.enum(['private', 'workspace']).optional(),
        content: z.string().optional(),
        notes: z
          .array(z.object({ title: z.string().min(1), content: z.string().optional() }))
          .min(1)
          .max(50),
        heading: z.string().optional(),
        listStyle: z.enum(['bullet', 'checklist']).optional(),
        placement: z.enum(['append', 'none']).optional(),
      }),
    },
    (async (args: {
      workspaceId?: string;
      workspace?: string;
      noteId?: string;
      hash?: string;
      title?: string;
      parentId?: string | null;
      visibility?: 'private' | 'workspace';
      content?: string;
      notes: { title: string; content?: string }[];
      heading?: string;
      listStyle?: 'bullet' | 'checklist';
      placement?: 'append' | 'none';
    }) =>
      run('create_linked_notes', () =>
        service.createLinkedNotes(currentDocsAuth().userId, currentDocsAuth().tokenId, {
          ...args,
          workspaceRef: workspaceRef(args),
          defaultWorkspaceId: currentDocsAuth().defaultWorkspaceId,
        })
      )) as never
  );

  server.registerTool(
    'trash_note',
    {
      title: 'Trash note',
      description: 'Soft-trash a note and its descendants. Author only. Does not permanently delete.',
      inputSchema: z.object({
        ...workspaceFields,
        noteId: z.string().uuid(),
      }),
    },
    (async (args: { workspaceId?: string; workspace?: string; noteId: string }) =>
      run('trash_note', () =>
        service.trashNote(
          currentDocsAuth().userId,
          currentDocsAuth().tokenId,
          args.noteId,
          workspaceRef(args)
        )
      )) as never
  );
}
