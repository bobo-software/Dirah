import { z } from 'zod';
import type { Request, Response } from 'express';
import type { McpTokenService } from '../services/McpTokenService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';

const createSchema = z.object({
  name: z.string().max(80).optional(),
});

const accessSchema = z.object({
  workspaces: z.array(
    z.object({
      workspaceId: z.uuid(),
      canWrite: z.boolean().optional(),
    })
  ),
});

export function createMcpSettingsController(tokens: McpTokenService) {
  return {
    listTokens: asyncHandler(async (req: Request, res: Response) => {
      const list = await tokens.listTokens(req.user!.userId);
      return ResponseUtils.success(res, 'ok', { tokens: list });
    }),

    createToken: asyncHandler(async (req: Request, res: Response) => {
      const parsed = createSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid token payload', parsed.error.flatten(), 400);
      }
      const token = await tokens.createToken(req.user!.userId, parsed.data.name ?? 'MCP token');
      return ResponseUtils.success(res, 'Token created', { token }, 201);
    }),

    revokeToken: asyncHandler(async (req: Request, res: Response) => {
      const id = req.params.id;
      if (!id) {
        return ResponseUtils.error(res, 'Token id is required', null, 400);
      }
      await tokens.revokeToken(req.user!.userId, id);
      return ResponseUtils.success(res, 'Token revoked');
    }),

    getAccess: asyncHandler(async (req: Request, res: Response) => {
      const workspaces = await tokens.listAccess(req.user!.userId);
      return ResponseUtils.success(res, 'ok', { workspaces });
    }),

    setAccess: asyncHandler(async (req: Request, res: Response) => {
      const parsed = accessSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid access payload', parsed.error.flatten(), 400);
      }
      const workspaces = await tokens.setAccess(req.user!.userId, parsed.data.workspaces);
      return ResponseUtils.success(res, 'ok', { workspaces });
    }),
  };
}
