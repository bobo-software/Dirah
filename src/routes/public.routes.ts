import { Router } from 'express';
import { createPublicController } from '../controllers/share.controller';
import type { ShareService } from '../services/ShareService';
import type { DocSyncService } from '../services/DocSyncService';
import type { BlobService } from '../services/BlobService';

export function createPublicRouter(
  shares: ShareService,
  sync: DocSyncService,
  blobs: BlobService
): Router {
  const router = Router();
  const controller = createPublicController(shares, sync, blobs);
  router.get('/pages/:token', controller.page);
  router.get('/pages/:token/updates', controller.updates);
  router.get('/pages/:token/blobs/:blobId', controller.blob);
  return router;
}
