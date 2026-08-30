import { z } from 'zod';
import type { Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';

const createSchema = z.object({
  name: z.string().min(1),
});

export function createWorkspaceController(authService: AuthService) {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const workspaces = await authService.listWorkspaces(req.user!.userId);
      return ResponseUtils.success(res, 'ok', { workspaces });
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Workspace name is required', parsed.error.flatten(), 400);
      }
      const workspace = await authService.createWorkspace(req.user!.userId, parsed.data.name);
      return ResponseUtils.success(res, 'Workspace created', { workspace }, 201);
    }),

    get: asyncHandler(async (req: Request, res: Response) => {
      const id = req.params.id;
      if (!id) {
        return ResponseUtils.error(res, 'Workspace id is required', null, 400);
      }
      const workspace = await authService.getWorkspace(req.user!.userId, id);
      return ResponseUtils.success(res, 'ok', { workspace });
    }),
  };
}