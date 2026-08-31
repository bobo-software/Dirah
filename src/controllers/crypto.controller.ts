import { z } from 'zod';
import type { Request, Response } from 'express';
import { CryptoService } from '../services/CryptoService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';

const bundleSchema = z.object({
  publicKey: z.string().min(1),
  wrappedPrivateKey: z.string().min(1),
  kdfSalt: z.string().min(1),
  kdfIterations: z.number().int().min(1000),
});

const memberDekSchema = z.object({
  userId: z.string().uuid(),
  wrappedDek: z.string().min(1),
});

export function createCryptoController(crypto: CryptoService) {
  return {
    getMine: asyncHandler(async (req: Request, res: Response) => {
      const bundle = await crypto.getUserBundle(req.user!.userId);
      return ResponseUtils.success(res, 'ok', { crypto: bundle });
    }),

    putMine: asyncHandler(async (req: Request, res: Response) => {
      const parsed = bundleSchema.safeParse(req.body);
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid crypto bundle', parsed.error.flatten(), 400);
      }
      await crypto.putUserBundle(req.user!.userId, parsed.data);
      return ResponseUtils.success(res, 'Crypto keys stored');
    }),

    getWorkspace: asyncHandler(async (req: Request, res: Response) => {
      const workspaceId = req.params.id;
      if (!workspaceId) {
        return ResponseUtils.error(res, 'Workspace id is required', null, 400);
      }
      const view = await crypto.getWorkspaceCrypto(req.user!.userId, workspaceId);
      return ResponseUtils.success(res, 'ok', { crypto: view });
    }),

    putMemberKey: asyncHandler(async (req: Request, res: Response) => {
      const workspaceId = req.params.id;
      if (!workspaceId) {
        return ResponseUtils.error(res, 'Workspace id is required', null, 400);
      }
      const parsed = memberDekSchema.safeParse(req.body);
      if (!parsed.success) {
        return ResponseUtils.error(res, 'userId and wrappedDek are required', parsed.error.flatten(), 400);
      }
      await crypto.putMemberDek(
        req.user!.userId,
        workspaceId,
        parsed.data.userId,
        parsed.data.wrappedDek
      );
      return ResponseUtils.success(res, 'Workspace key stored');
    }),
  };
}
