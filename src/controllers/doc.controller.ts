import type { Request, Response } from 'express';
import { DocSyncService } from '../services/DocSyncService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';

export function createDocController(sync: DocSyncService) {
  return {
    updates: asyncHandler(async (req: Request, res: Response) => {
      const pageId = req.params.id;
      if (!pageId) {
        return ResponseUtils.error(res, 'Page id is required', null, 400);
      }
      const clock = Number(req.query.clock ?? 0);
      const catchup = await sync.catchup(req.user!.userId, pageId, Number.isFinite(clock) ? clock : 0);
      return ResponseUtils.success(res, 'ok', {
        clock: catchup.clock,
        snapshot: catchup.snapshot ? catchup.snapshot.toString('base64') : null,
        updates: catchup.updates.map((row) => ({
          id: row.id,
          update: row.update.toString('base64'),
        })),
      });
    }),

    listSnapshots: asyncHandler(async (req: Request, res: Response) => {
      const pageId = req.params.id;
      if (!pageId) {
        return ResponseUtils.error(res, 'Page id is required', null, 400);
      }
      const snapshots = await sync.listRevisions(req.user!.userId, pageId);
      return ResponseUtils.success(res, 'ok', { snapshots });
    }),

    saveSnapshot: asyncHandler(async (req: Request, res: Response) => {
      const pageId = req.params.id;
      if (!pageId) {
        return ResponseUtils.error(res, 'Page id is required', null, 400);
      }
      const snapshot = await sync.saveRevision(req.user!.userId, pageId);
      return ResponseUtils.success(res, 'Version saved', { snapshot }, 201);
    }),

    getSnapshot: asyncHandler(async (req: Request, res: Response) => {
      const pageId = req.params.id;
      const snapshotId = Number(req.params.snapshotId);
      if (!pageId || !Number.isFinite(snapshotId)) {
        return ResponseUtils.error(res, 'Version id is required', null, 400);
      }
      const snapshot = await sync.getRevision(req.user!.userId, pageId, snapshotId);
      return ResponseUtils.success(res, 'ok', { snapshot });
    }),

    restoreSnapshot: asyncHandler(async (req: Request, res: Response) => {
      const pageId = req.params.id;
      const snapshotId = Number(req.params.snapshotId);
      if (!pageId || !Number.isFinite(snapshotId)) {
        return ResponseUtils.error(res, 'Version id is required', null, 400);
      }
      await sync.restoreRevision(req.user!.userId, pageId, snapshotId);
      return ResponseUtils.success(res, 'Version restored');
    }),
  };
}
