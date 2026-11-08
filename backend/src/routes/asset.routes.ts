import { Router, json } from 'express';
import { createAssetController } from '../controllers/asset.controller';
import type { AssetService } from '../services/AssetService';
import type { BlobService } from '../services/BlobService';
import type { MediaUrlService } from '../services/MediaUrlService';
import { requireAuth } from '../middlewares/auth';

/** /api/workspaces/:id/assets: upload (streamed raw body), import from URL, search. */
export function createWorkspaceAssetRouter(assets: AssetService, blobs: BlobService, urls: MediaUrlService): Router {
  const router = Router({ mergeParams: true });
  const controller = createAssetController(assets, blobs, urls);
  router.use(requireAuth);
  router.get('/', controller.search);
  router.post('/', controller.upload);
  router.post('/import', json({ limit: '256kb' }), controller.importUrl);
  return router;
}

/** /api/assets/:pageId: read, edit, reprocess one asset. */
export function createAssetRouter(assets: AssetService, blobs: BlobService, urls: MediaUrlService): Router {
  const router = Router();
  const controller = createAssetController(assets, blobs, urls);
  router.use(requireAuth);
  router.get('/:pageId', controller.get);
  router.patch('/:pageId', controller.patch);
  router.post('/:pageId/reprocess', controller.reprocess);
  return router;
}

/** /api/media/:blobId?exp=&sig=: temporary public links, no login. */
export function createMediaRouter(assets: AssetService, blobs: BlobService, urls: MediaUrlService): Router {
  const router = Router();
  const controller = createAssetController(assets, blobs, urls);
  router.get('/:blobId', controller.media);
  router.head('/:blobId', controller.media);
  return router;
}
