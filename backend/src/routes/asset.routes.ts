import { Router, json } from 'express';
import { createAssetController } from '../controllers/asset.controller';
import type { AssetService } from '../services/AssetService';
import type { BlobService } from '../services/BlobService';
import type { MediaUrlService } from '../services/MediaUrlService';
import type { AssetsMcpService } from '../services/AssetsMcpService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';
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

/**
 * /api/uploads/:token: single-use upload links made by the MCP create_asset_upload
 * tool. The signed token is the credential; the raw request body is the file.
 */
export function createUploadRouter(mcp: AssetsMcpService): Router {
  const router = Router();
  const handler = asyncHandler(async (req, res) => {
    if ((req as typeof req & { _body?: boolean })._body) {
      return ResponseUtils.error(res, 'Send the raw file bytes as the body (curl -T file <url>)', null, 400);
    }
    const asset = await mcp.completeUpload(req.params.token ?? '', req);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return ResponseUtils.success(res, 'Asset stored', { asset }, 201);
  });
  router.put('/:token', handler);
  router.post('/:token', handler);
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
