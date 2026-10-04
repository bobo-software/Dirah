import { z } from 'zod';
import type { Request, Response } from 'express';
import { NoteService, NOTE_KINDS, NOTE_VISIBILITIES } from '../services/NoteService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';

const uuid = z.uuid();
const visibility = z.enum(NOTE_VISIBILITIES);
const icon = z.string().max(16).nullable();
const cover = z.string().max(32).nullable();

const createSchema = z.object({
  title: z.string().max(500).optional(),
  parentId: uuid.nullable().optional(),
  icon: icon.optional(),
  cover: cover.optional(),
  visibility: visibility.optional(),
  kind: z.enum(NOTE_KINDS).optional(),
});

const columnCreateSchema = z.object({
  title: z.string().max(200).optional(),
});

const columnPatchSchema = z.object({
  title: z.string().max(200).optional(),
  position: z.number().int().optional(),
});

const columnOrderSchema = z.object({
  columnIds: z.array(uuid).min(1),
});

const cardCreateSchema = z
  .object({
    columnId: uuid,
    title: z.string().max(500).optional(),
    noteId: uuid.optional(),
  })
  .refine((data) => !(data.noteId && data.title !== undefined), {
    message: 'Pass a title or a note, not both',
  });

const cardMoveSchema = z.object({
  boardId: uuid,
  noteId: uuid,
  columnId: uuid,
  position: z.number().int().min(0),
});

const cardRemoveSchema = z.object({
  boardId: uuid,
  noteId: uuid,
});

const patchSchema = z.object({
  title: z.string().max(500).optional(),
  parentId: uuid.nullable().optional(),
  position: z.number().int().optional(),
  icon: icon.optional(),
  cover: cover.optional(),
  visibility: visibility.optional(),
  pinned: z.boolean().optional(),
});

const contentPutSchema = z.object({
  content: z.string(),
  hash: z.string().optional(),
});

const tagsPutSchema = z.object({
  tagIds: z.array(uuid).max(50),
});

const tagCreateSchema = z.object({
  name: z.string(),
  color: z.string().max(32).optional(),
});

const tagPatchSchema = z.object({
  name: z.string().optional(),
  color: z.string().max(32).optional(),
});

function noteBody(body: Awaited<ReturnType<NoteService['get']>>) {
  return { note: body.note, content: body.content, hash: body.hash, updatedAt: body.updatedAt };
}

export function createNoteController(noteService: NoteService) {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const workspaceId = req.params.id;
      if (!workspaceId) {
        return ResponseUtils.error(res, 'Workspace id is required', null, 400);
      }
      const trashed = req.query.trashed === '1' || req.query.trashed === 'true';
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const tagId =
        typeof req.query.tagId === 'string' && uuid.safeParse(req.query.tagId).success
          ? req.query.tagId
          : undefined;
      const scope =
        req.query.scope === 'mine' || req.query.scope === 'shared' ? req.query.scope : undefined;
      const notes = await noteService.list(req.user!.userId, workspaceId, { trashed, q, tagId, scope });
      return ResponseUtils.success(res, 'ok', { notes });
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
      const workspaceId = req.params.id;
      if (!workspaceId) {
        return ResponseUtils.error(res, 'Workspace id is required', null, 400);
      }
      const parsed = createSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid note payload', parsed.error.flatten(), 400);
      }
      const note = await noteService.create(req.user!.userId, workspaceId, parsed.data);
      return ResponseUtils.success(res, 'Note created', { note }, 201);
    }),

    get: asyncHandler(async (req: Request, res: Response) => {
      const body = await noteService.get(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'ok', noteBody(body));
    }),

    backlinks: asyncHandler(async (req: Request, res: Response) => {
      const backlinks = await noteService.backlinks(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'ok', { backlinks });
    }),

    getBoard: asyncHandler(async (req: Request, res: Response) => {
      const board = await noteService.getBoard(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'ok', board);
    }),

    createColumn: asyncHandler(async (req: Request, res: Response) => {
      const parsed = columnCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid column payload', parsed.error.flatten(), 400);
      }
      const board = await noteService.createColumn(req.user!.userId, req.params.id, parsed.data);
      return ResponseUtils.success(res, 'Column created', board, 201);
    }),

    patchColumn: asyncHandler(async (req: Request, res: Response) => {
      const parsed = columnPatchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid column payload', parsed.error.flatten(), 400);
      }
      const board = await noteService.patchColumn(req.user!.userId, req.params.id, parsed.data);
      return ResponseUtils.success(res, 'ok', board);
    }),

    deleteColumn: asyncHandler(async (req: Request, res: Response) => {
      const board = await noteService.deleteColumn(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'Column deleted', board);
    }),

    orderColumns: asyncHandler(async (req: Request, res: Response) => {
      const parsed = columnOrderSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid column order', parsed.error.flatten(), 400);
      }
      const board = await noteService.orderColumns(req.user!.userId, req.params.id, parsed.data.columnIds);
      return ResponseUtils.success(res, 'ok', board);
    }),

    createCard: asyncHandler(async (req: Request, res: Response) => {
      const parsed = cardCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid card payload', parsed.error.flatten(), 400);
      }
      const board = await noteService.addCard(req.user!.userId, req.params.id, parsed.data);
      return ResponseUtils.success(res, 'Card added', board, 201);
    }),

    moveCard: asyncHandler(async (req: Request, res: Response) => {
      const parsed = cardMoveSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid card move', parsed.error.flatten(), 400);
      }
      const board = await noteService.moveCard(req.user!.userId, parsed.data);
      return ResponseUtils.success(res, 'ok', board);
    }),

    removeCard: asyncHandler(async (req: Request, res: Response) => {
      const parsed = cardRemoveSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid card payload', parsed.error.flatten(), 400);
      }
      const board = await noteService.removeCard(req.user!.userId, parsed.data.boardId, parsed.data.noteId);
      return ResponseUtils.success(res, 'Card removed', board);
    }),

    patch: asyncHandler(async (req: Request, res: Response) => {
      const parsed = patchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid note payload', parsed.error.flatten(), 400);
      }
      const note = await noteService.patch(req.user!.userId, req.params.id, parsed.data);
      return ResponseUtils.success(res, 'ok', { note });
    }),

    putContent: asyncHandler(async (req: Request, res: Response) => {
      const parsed = contentPutSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid note content payload', parsed.error.flatten(), 400);
      }
      const ifMatch = req.header('if-match')?.replace(/^"|"$/g, '').trim();
      const expectedHash = parsed.data.hash ?? (ifMatch || undefined);
      const body = await noteService.putContent(
        req.user!.userId,
        req.params.id,
        parsed.data.content,
        expectedHash
      );
      return ResponseUtils.success(res, 'ok', noteBody(body));
    }),

    putTags: asyncHandler(async (req: Request, res: Response) => {
      const parsed = tagsPutSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid tags payload', parsed.error.flatten(), 400);
      }
      const note = await noteService.setTags(req.user!.userId, req.params.id, parsed.data.tagIds);
      return ResponseUtils.success(res, 'ok', { note });
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
      await noteService.trash(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'Note moved to trash');
    }),

    restore: asyncHandler(async (req: Request, res: Response) => {
      const note = await noteService.restore(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'Note restored', { note });
    }),

    removePermanent: asyncHandler(async (req: Request, res: Response) => {
      const ids = await noteService.removePermanent(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'Note deleted', { ids });
    }),

    listTags: asyncHandler(async (req: Request, res: Response) => {
      const tags = await noteService.listTags(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'ok', { tags });
    }),

    createTag: asyncHandler(async (req: Request, res: Response) => {
      const parsed = tagCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid tag payload', parsed.error.flatten(), 400);
      }
      const tag = await noteService.createTag(req.user!.userId, req.params.id, parsed.data);
      return ResponseUtils.success(res, 'Tag created', { tag }, 201);
    }),

    patchTag: asyncHandler(async (req: Request, res: Response) => {
      const parsed = tagPatchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid tag payload', parsed.error.flatten(), 400);
      }
      const tag = await noteService.patchTag(req.user!.userId, req.params.tagId, parsed.data);
      return ResponseUtils.success(res, 'ok', { tag });
    }),

    deleteTag: asyncHandler(async (req: Request, res: Response) => {
      await noteService.deleteTag(req.user!.userId, req.params.tagId);
      return ResponseUtils.success(res, 'Tag deleted');
    }),
  };
}
