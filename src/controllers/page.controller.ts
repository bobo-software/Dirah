import { z } from 'zod';
import type { Request, Response } from 'express';
import { PageService } from '../services/PageService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';

const uuid = z.uuid();

const createSchema = z.object({
  id: uuid.optional(),
  title: z.string().optional(),
  parentId: uuid.nullable().optional(),
});

const patchSchema = z.object({
  title: z.string().optional(),
  parentId: uuid.nullable().optional(),
  position: z.number().int().optional(),
  status: z.enum(['', 'todo', 'doing', 'done']).optional(),
});

export function createPageController(pageService: PageService) {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const workspaceId = req.params.id;
      if (!workspaceId) {
        return ResponseUtils.error(res, 'Workspace id is required', null, 400);
      }
      const trashed = req.query.trashed === '1' || req.query.trashed === 'true';
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const pages = await pageService.list(req.user!.userId, workspaceId, { trashed, q });
      return ResponseUtils.success(res, 'ok', { pages });
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
      const workspaceId = req.params.id;
      if (!workspaceId) {
        return ResponseUtils.error(res, 'Workspace id is required', null, 400);
      }
      const parsed = createSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid page payload', parsed.error.flatten(), 400);
      }
      const page = await pageService.create(req.user!.userId, workspaceId, parsed.data);
      return ResponseUtils.success(res, 'Page created', { page }, 201);
    }),

    patch: asyncHandler(async (req: Request, res: Response) => {
      const pageId = req.params.id;
      if (!pageId) {
        return ResponseUtils.error(res, 'Page id is required', null, 400);
      }
      const parsed = patchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid page payload', parsed.error.flatten(), 400);
      }
      const page = await pageService.patch(req.user!.userId, pageId, parsed.data);
      return ResponseUtils.success(res, 'ok', { page });
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
      const pageId = req.params.id;
      if (!pageId) {
        return ResponseUtils.error(res, 'Page id is required', null, 400);
      }
      await pageService.trash(req.user!.userId, pageId);
      return ResponseUtils.success(res, 'Page moved to trash');
    }),

    restore: asyncHandler(async (req: Request, res: Response) => {
      const pageId = req.params.id;
      if (!pageId) {
        return ResponseUtils.error(res, 'Page id is required', null, 400);
      }
      const page = await pageService.restore(req.user!.userId, pageId);
      return ResponseUtils.success(res, 'Page restored', { page });
    }),

    removePermanent: asyncHandler(async (req: Request, res: Response) => {
      const pageId = req.params.id;
      if (!pageId) {
        return ResponseUtils.error(res, 'Page id is required', null, 400);
      }
      const ids = await pageService.removePermanent(req.user!.userId, pageId);
      return ResponseUtils.success(res, 'Page deleted', { ids });
    }),

    favorite: asyncHandler(async (req: Request, res: Response) => {
      const pageId = req.params.id;
      if (!pageId) {
        return ResponseUtils.error(res, 'Page id is required', null, 400);
      }
      const page = await pageService.setFavorite(req.user!.userId, pageId, true);
      return ResponseUtils.success(res, 'ok', { page });
    }),

    unfavorite: asyncHandler(async (req: Request, res: Response) => {
      const pageId = req.params.id;
      if (!pageId) {
        return ResponseUtils.error(res, 'Page id is required', null, 400);
      }
      const page = await pageService.setFavorite(req.user!.userId, pageId, false);
      return ResponseUtils.success(res, 'ok', { page });
    }),
  };
}
