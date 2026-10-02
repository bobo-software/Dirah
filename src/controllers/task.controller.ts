import { z } from 'zod';
import type { Request, Response } from 'express';
import {
  MAX_TASK_ITEM_TEXT,
  MAX_TASK_ITEMS_PER_ADD,
  TASK_LIST_MODES,
  TASK_LIST_VISIBILITIES,
  TaskListService,
} from '../services/TaskListService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';

const uuid = z.uuid();
const visibility = z.enum(TASK_LIST_VISIBILITIES);
const icon = z.string().max(16).nullable();
const itemText = z.string().max(MAX_TASK_ITEM_TEXT);

const createSchema = z.object({
  title: z.string().max(200).optional(),
  icon: icon.optional(),
  visibility: visibility.optional(),
  mode: z.enum(TASK_LIST_MODES).optional(),
});

const patchSchema = z.object({
  title: z.string().max(200).optional(),
  icon: icon.optional(),
  visibility: visibility.optional(),
  position: z.number().int().optional(),
});

const itemsCreateSchema = z
  .object({
    text: itemText.optional(),
    texts: z.array(itemText).min(1).max(MAX_TASK_ITEMS_PER_ADD).optional(),
  })
  .refine((data) => (data.text === undefined) !== (data.texts === undefined), {
    message: 'Pass text or texts',
  });

const fromNoteSchema = z.object({
  noteId: uuid,
});

const itemsOrderSchema = z.object({
  itemIds: z.array(uuid).min(1),
});

const itemPatchSchema = z
  .object({
    text: itemText.optional(),
    checked: z.boolean().optional(),
  })
  .refine((data) => data.text !== undefined || data.checked !== undefined, {
    message: 'Nothing to change',
  });

export function createTaskController(taskListService: TaskListService) {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const lists = await taskListService.list(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'ok', { lists });
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
      const parsed = createSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid task list payload', parsed.error.flatten(), 400);
      }
      const list = await taskListService.create(req.user!.userId, req.params.id, parsed.data);
      return ResponseUtils.success(res, 'Task list created', { list }, 201);
    }),

    createFromNote: asyncHandler(async (req: Request, res: Response) => {
      const parsed = fromNoteSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid note reference', parsed.error.flatten(), 400);
      }
      const view = await taskListService.createFromNote(req.user!.userId, parsed.data.noteId);
      return ResponseUtils.success(res, 'Task list created from note', view, 201);
    }),

    get: asyncHandler(async (req: Request, res: Response) => {
      const view = await taskListService.get(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'ok', view);
    }),

    patch: asyncHandler(async (req: Request, res: Response) => {
      const parsed = patchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid task list payload', parsed.error.flatten(), 400);
      }
      const list = await taskListService.patch(req.user!.userId, req.params.id, parsed.data);
      return ResponseUtils.success(res, 'Task list updated', { list });
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
      await taskListService.remove(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'Task list deleted', null);
    }),

    addItems: asyncHandler(async (req: Request, res: Response) => {
      const parsed = itemsCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid item payload', parsed.error.flatten(), 400);
      }
      const texts = parsed.data.texts ?? [parsed.data.text!];
      const view = await taskListService.addItems(req.user!.userId, req.params.id, texts);
      return ResponseUtils.success(res, 'Items added', view, 201);
    }),

    orderItems: asyncHandler(async (req: Request, res: Response) => {
      const parsed = itemsOrderSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid item order', parsed.error.flatten(), 400);
      }
      const view = await taskListService.orderItems(req.user!.userId, req.params.id, parsed.data.itemIds);
      return ResponseUtils.success(res, 'Items reordered', view);
    }),

    reset: asyncHandler(async (req: Request, res: Response) => {
      const view = await taskListService.reset(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'Task list reset', view);
    }),

    patchItem: asyncHandler(async (req: Request, res: Response) => {
      const parsed = itemPatchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid item payload', parsed.error.flatten(), 400);
      }
      const item = await taskListService.patchItem(req.user!.userId, req.params.id, parsed.data);
      return ResponseUtils.success(res, 'Item updated', { item });
    }),

    removeItem: asyncHandler(async (req: Request, res: Response) => {
      await taskListService.removeItem(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'Item deleted', null);
    }),
  };
}
