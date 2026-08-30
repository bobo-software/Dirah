import { z } from 'zod';
import type { Request, Response } from 'express';
import { ShareService } from '../services/ShareService';
import { BlobService } from '../services/BlobService';
import { DocSyncService } from '../services/DocSyncService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';

const createSchema = z.object({
  permission: z.string().default('view'),
});

export function createShareController(shares: ShareService) {
  return {
    get: asyncHandler(async (req: Request, res: Response) => {
      const pageId = req.params.id;
      if (!pageId) {
        return ResponseUtils.error(res, 'Page id is required', null, 400);
      }
      const share = await shares.getForPage(req.user!.userId, pageId);
      return ResponseUtils.success(res, 'ok', { share });
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
      const pageId = req.params.id;
      if (!pageId) {
        return ResponseUtils.error(res, 'Page id is required', null, 400);
      }
      const parsed = createSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid share payload', parsed.error.flatten(), 400);
      }
      const share = await shares.create(req.user!.userId, pageId, parsed.data.permission);
      return ResponseUtils.success(res, 'Share link created', { share }, 201);
    }),

    revoke: asyncHandler(async (req: Request, res: Response) => {
      const pageId = req.params.id;
      if (!pageId) {
        return ResponseUtils.error(res, 'Page id is required', null, 400);
      }
      await shares.revoke(req.user!.userId, pageId);
      return ResponseUtils.success(res, 'Share link revoked');
    }),
  };
}

export function createPublicController(shares: ShareService, sync: DocSyncService, blobs: BlobService) {
  return {
    page: asyncHandler(async (req: Request, res: Response) => {
      const token = req.params.token;
      if (!token) {
        return ResponseUtils.error(res, 'Token is required', null, 400);
      }
      const page = await shares.requireActive(token);
      return ResponseUtils.success(res, 'ok', {
        page: { id: page.id, title: page.title, workspaceId: page.workspaceId },
        permission: 'view',
      });
    }),

    updates: asyncHandler(async (req: Request, res: Response) => {
      const token = req.params.token;
      if (!token) {
        return ResponseUtils.error(res, 'Token is required', null, 400);
      }
      const page = await shares.requireActive(token);
      const clock = Number(req.query.clock ?? 0);
      const catchup = await sync.catchupShare(token, page.id, Number.isFinite(clock) ? clock : 0);
      return ResponseUtils.success(res, 'ok', {
        clock: catchup.clock,
        snapshot: catchup.snapshot ? catchup.snapshot.toString('base64') : null,
        updates: catchup.updates.map((row) => ({
          id: row.id,
          update: row.update.toString('base64'),
        })),
      });
    }),

    blob: asyncHandler(async (req: Request, res: Response) => {
      const token = req.params.token;
      const blobId = req.params.blobId;
      if (!token || !blobId) {
        return ResponseUtils.error(res, 'Token and blob id are required', null, 400);
      }
      const page = await shares.requireActive(token);
      const { meta, body } = await blobs.getInWorkspace(page.workspaceId, blobId);
      res.setHeader('Content-Type', meta.mime);
      res.setHeader('Content-Length', String(body.length));
      return res.send(body);
    }),
  };
}
