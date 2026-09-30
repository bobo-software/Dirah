import { z } from 'zod';
import type { Request, Response } from 'express';
import type { McpTokenService } from '../services/McpTokenService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';

const createSchema = z.object({
  name: z.string().max(80).optional(),
  defaultWorkspaceId: z.uuid().optional(),
  workspaceAccess: z
    .array(
      z.object({
        workspaceId: z.uuid(),
        canWrite: z.boolean().optional(),
      })
    )
    .optional(),
});

const updateSchema = z.object({
  name: z.string().max(80).optional(),
  defaultWorkspaceId: z.uuid().nullable().optional(),
});

const tokenIdSchema = z.uuid();

const tokenAccessSchema = z.object({
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
      const token = await tokens.createToken(req.user!.userId, parsed.data.name ?? 'MCP token', {
        defaultWorkspaceId: parsed.data.defaultWorkspaceId,
        workspaceAccess: parsed.data.workspaceAccess,
      });
      return ResponseUtils.success(res, 'Token created', { token }, 201);
    }),

    updateToken: asyncHandler(async (req: Request, res: Response) => {
      const id = req.params.id;
      if (!tokenIdSchema.safeParse(id).success) {
        return ResponseUtils.error(res, 'Token not found', null, 404);
      }
      const parsed = updateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid token payload', parsed.error.flatten(), 400);
      }
      const token = await tokens.updateToken(req.user!.userId, id, parsed.data);
      return ResponseUtils.success(res, 'Token updated', { token });
    }),

    rotateToken: asyncHandler(async (req: Request, res: Response) => {
      const id = req.params.id;
      if (!tokenIdSchema.safeParse(id).success) {
        return ResponseUtils.error(res, 'Token not found', null, 404);
      }
      const token = await tokens.rotateToken(req.user!.userId, id);
      return ResponseUtils.success(res, 'Token rotated', { token });
    }),

    revokeToken: asyncHandler(async (req: Request, res: Response) => {
      const id = req.params.id;
      if (!tokenIdSchema.safeParse(id).success) {
        return ResponseUtils.error(res, 'Token not found', null, 404);
      }
      await tokens.revokeToken(req.user!.userId, id);
      return ResponseUtils.success(res, 'Token revoked');
    }),

    getTokenAccess: asyncHandler(async (req: Request, res: Response) => {
      const id = req.params.id;
      if (!tokenIdSchema.safeParse(id).success) {
        return ResponseUtils.error(res, 'Token not found', null, 404);
      }
      const workspaces = await tokens.listTokenAccess(req.user!.userId, id);
      return ResponseUtils.success(res, 'ok', { workspaces });
    }),

    setTokenAccess: asyncHandler(async (req: Request, res: Response) => {
      const id = req.params.id;
      if (!tokenIdSchema.safeParse(id).success) {
        return ResponseUtils.error(res, 'Token not found', null, 404);
      }
      const parsed = tokenAccessSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid access payload', parsed.error.flatten(), 400);
      }
      const workspaces = await tokens.setTokenAccess(req.user!.userId, id, parsed.data.workspaces);
      return ResponseUtils.success(res, 'ok', { workspaces });
    }),
  };
}
