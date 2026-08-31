import { Router } from 'express';
import { createPublicController } from '../controllers/share.controller';
import type { ShareService } from '../services/ShareService';
import type { BlobService } from '../services/BlobService';

export function createPublicRouter(shares: ShareService, blobs: BlobService): Router {
  const router = Router();
  const controller = createPublicController(shares, blobs);
  router.get('/pages/:token', controller.page);
  router.get('/pages/:token/markdown', controller.markdown);
  router.get('/pages/:token/blobs/:blobId', controller.blob);
  return router;
}
