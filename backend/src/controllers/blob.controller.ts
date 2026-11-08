import type { Request, Response } from 'express';
import { BlobService } from '../services/BlobService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';
import { sendBlob } from '../utils/sendBlob';

/** Blob bytes never change for an id; access can, so caches stay private. */
const BLOB_CACHE_CONTROL = 'private, max-age=86400';

export function createBlobController(blobs: BlobService) {
  return {
    upload: asyncHandler(async (req: Request, res: Response) => {
      const workspaceId = req.params.id;
      if (!workspaceId) {
        return ResponseUtils.error(res, 'Workspace id is required', null, 400);
      }
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
      const headerId = (req.header('x-dirah-blob-id') ?? req.header('x-dirah-blob-id'))?.trim();
      const id = headerId && headerId.length <= 128 ? headerId : undefined;
      const mime = req.header('content-type') ?? 'application/octet-stream';
      const blob = await blobs.upload(req.user!.userId, workspaceId, body, mime, id);
      return ResponseUtils.success(
        res,
        'Blob stored',
        { blob: { ...blob, url: `/api/blobs/${blob.id}` } },
        201
      );
    }),

    list: asyncHandler(async (req: Request, res: Response) => {
      const workspaceId = req.params.id;
      if (!workspaceId) {
        return ResponseUtils.error(res, 'Workspace id is required', null, 400);
      }
      const ids = await blobs.list(req.user!.userId, workspaceId);
      return ResponseUtils.success(res, 'ok', { blobs: ids });
    }),

    download: asyncHandler(async (req: Request, res: Response) => {
      const blobId = req.params.id;
      if (!blobId) {
        return ResponseUtils.error(res, 'Blob id is required', null, 400);
      }
      const info = await blobs.info(req.user!.userId, blobId);
      await sendBlob(req, res, blobs, info, { cacheControl: BLOB_CACHE_CONTROL });
    }),

    downloadInWorkspace: asyncHandler(async (req: Request, res: Response) => {
      const workspaceId = req.params.id;
      const blobId = req.params.blobId;
      if (!workspaceId || !blobId) {
        return ResponseUtils.error(res, 'Workspace id and blob id are required', null, 400);
      }
      const info = await blobs.info(req.user!.userId, blobId);
      if (info.meta.workspaceId !== workspaceId) {
        return ResponseUtils.error(res, 'Blob not found', null, 404);
      }
      await sendBlob(req, res, blobs, info, { cacheControl: BLOB_CACHE_CONTROL });
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
      const blobId = req.params.id;
      if (!blobId) {
        return ResponseUtils.error(res, 'Blob id is required', null, 400);
      }
      await blobs.remove(req.user!.userId, blobId);
      return ResponseUtils.success(res, 'Blob deleted');
    }),
  };
}
