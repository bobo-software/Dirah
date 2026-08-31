import { z } from 'zod';
import type { Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import type { McpTokenService } from '../services/McpTokenService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';

const createSchema = z.object({
  name: z.string().min(1),
});

const patchSchema = z.object({
  mcpEnabled: z.boolean(),
});

export function createWorkspaceController(authService: AuthService, mcpTokens?: McpTokenService) {
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

    patch: asyncHandler(async (req: Request, res: Response) => {
      const id = req.params.id;
      if (!id) {
        return ResponseUtils.error(res, 'Workspace id is required', null, 400);
      }
      const parsed = patchSchema.safeParse(req.body ?? {});
      if (!parsed.success || !mcpTokens) {
        return ResponseUtils.error(res, 'Invalid workspace payload', parsed.success ? null : parsed.error.flatten(), 400);
      }
      const workspace = await mcpTokens.setWorkspaceMcpEnabled(
        req.user!.userId,
        id,
        parsed.data.mcpEnabled
      );
      return ResponseUtils.success(res, 'ok', { workspace });
    }),
  };
}