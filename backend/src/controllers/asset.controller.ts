import { z } from 'zod';
import type { Request, Response } from 'express';
import { ASSET_ROLES, ASSET_STATUSES, type AssetService, type AssetView } from '../services/AssetService';
import type { BlobService } from '../services/BlobService';
import type { MediaUrlService } from '../services/MediaUrlService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpError } from '../utils/HttpError';
import { sendBlob } from '../utils/sendBlob';

const uuid = z.uuid();

const generationSchema = z
  .object({
    model: z.string().max(200).optional(),
    prompt: z.string().max(20_000).optional(),
    sourceAssetIds: z.array(uuid).max(50).optional(),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .nullable();

export const assetMetadataSchema = z.object({
  title: z.string().max(300).optional(),
  description: z.string().max(10_000).optional(),
  tags: z.array(z.string().max(100)).max(64).optional(),
  role: z.enum(ASSET_ROLES).optional(),
  promptHint: z.string().max(4_000).optional(),
  sourceUrl: z.string().max(2_000).nullable().optional(),
  license: z.string().max(500).nullable().optional(),
  generation: generationSchema.optional(),
});

const importSchema = assetMetadataSchema.extend({
  url: z.string().url().max(2_000),
  parentId: uuid.nullable().optional(),
});

function csv(raw: unknown): string[] | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  return raw.split(',').map((part) => part.trim()).filter(Boolean);
}

function stringParam(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

export function createAssetController(assets: AssetService, blobs: BlobService, urls: MediaUrlService) {
  const withLinks = (asset: AssetView, ttl?: number) => ({ ...asset, links: assets.links(asset, ttl) });

  return {
    /** Raw file body (streamed). Query: parentId, filename, title, role, tags. */
    upload: asyncHandler(async (req: Request, res: Response) => {
      const workspaceId = req.params.id;
      if (!workspaceId) return ResponseUtils.error(res, 'Workspace id is required', null, 400);
      if ((req as Request & { _body?: boolean })._body) {
        return ResponseUtils.error(res, 'Send the file as the raw request body (e.g. Content-Type: application/octet-stream)', null, 400);
      }
      const parentRaw = stringParam(req.query.parentId);
      if (parentRaw && !uuid.safeParse(parentRaw).success) {
        return ResponseUtils.error(res, 'Invalid parentId', null, 400);
      }
      const role = stringParam(req.query.role);
      if (role && !ASSET_ROLES.includes(role as (typeof ASSET_ROLES)[number])) {
        return ResponseUtils.error(res, 'Invalid role', null, 400);
      }
      const declared = Number(req.header('content-length'));
      if (Number.isFinite(declared) && declared > assets.maxBytes) {
        throw new HttpError(`File is larger than ${Math.round(assets.maxBytes / (1024 * 1024))} MB`, 413, 'BLOB_TOO_LARGE');
      }
      const asset = await assets.upload(req.user!.userId, workspaceId, {
        source: req,
        filename: stringParam(req.query.filename) ?? stringParam(req.header('x-dirah-filename')),
        title: stringParam(req.query.title),
        parentId: parentRaw ?? null,
        metadata: { role, tags: csv(req.query.tags) },
      });
      return ResponseUtils.success(res, 'Asset stored', { asset: withLinks(asset) }, 201);
    }),

    importUrl: asyncHandler(async (req: Request, res: Response) => {
      const workspaceId = req.params.id;
      if (!workspaceId) return ResponseUtils.error(res, 'Workspace id is required', null, 400);
      const parsed = importSchema.safeParse(req.body ?? {});
      if (!parsed.success) return ResponseUtils.error(res, 'Invalid import payload', parsed.error.flatten(), 400);
      const { url, parentId, title, ...metadata } = parsed.data;
      const asset = await assets.importFromUrl(req.user!.userId, workspaceId, { url, parentId, title, metadata });
      return ResponseUtils.success(res, 'Asset imported', { asset: withLinks(asset) }, 201);
    }),

    search: asyncHandler(async (req: Request, res: Response) => {
      const workspaceId = req.params.id;
      if (!workspaceId) return ResponseUtils.error(res, 'Workspace id is required', null, 400);
      const mediaType = stringParam(req.query.mediaType);
      if (mediaType && !['image', 'video', 'audio'].includes(mediaType)) {
        return ResponseUtils.error(res, 'Invalid mediaType', null, 400);
      }
      const status = stringParam(req.query.status);
      if (status && !ASSET_STATUSES.includes(status as (typeof ASSET_STATUSES)[number])) {
        return ResponseUtils.error(res, 'Invalid status', null, 400);
      }
      const parentId = stringParam(req.query.parentId);
      const result = await assets.search(req.user!.userId, workspaceId, {
        query: stringParam(req.query.q),
        mediaType: mediaType as 'image' | 'video' | 'audio' | undefined,
        role: stringParam(req.query.role),
        tags: csv(req.query.tags),
        status,
        parentIds: parentId ? [parentId === 'root' ? null : parentId] : undefined,
        limit: Number(req.query.limit) || undefined,
        offset: Number(req.query.offset) || undefined,
      });
      return ResponseUtils.success(res, 'ok', {
        assets: result.assets.map((asset) => withLinks(asset)),
        total: result.total,
      });
    }),

    get: asyncHandler(async (req: Request, res: Response) => {
      const asset = await assets.get(req.user!.userId, req.params.pageId!);
      const ttl = Number(req.query.ttl) || undefined;
      return ResponseUtils.success(res, 'ok', { asset: withLinks(asset, ttl) });
    }),

    patch: asyncHandler(async (req: Request, res: Response) => {
      const parsed = assetMetadataSchema.safeParse(req.body ?? {});
      if (!parsed.success) return ResponseUtils.error(res, 'Invalid asset payload', parsed.error.flatten(), 400);
      const asset = await assets.update(req.user!.userId, req.params.pageId!, parsed.data);
      return ResponseUtils.success(res, 'Asset updated', { asset: withLinks(asset) });
    }),

    reprocess: asyncHandler(async (req: Request, res: Response) => {
      const asset = await assets.reprocess(req.user!.userId, req.params.pageId!);
      return ResponseUtils.success(res, 'Processing restarted', { asset: withLinks(asset) });
    }),

    /** Public: a signed temporary link made by MediaUrlService. */
    media: asyncHandler(async (req: Request, res: Response) => {
      const blobId = req.params.blobId ?? '';
      const remaining = urls.verify(blobId, req.query.exp, req.query.sig);
      if (remaining === null) {
        return res.status(403).json({ success: false, message: 'This media link is invalid or has expired', error: 'MEDIA_LINK_INVALID' });
      }
      const owner = await assets.findServableByBlob(blobId);
      if (!owner) {
        return res.status(404).json({ success: false, message: 'Media not found', error: 'MEDIA_NOT_FOUND' });
      }
      const info = await blobs.infoUnchecked(blobId);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.removeHeader('Access-Control-Allow-Credentials');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Referrer-Policy', 'no-referrer');
      await sendBlob(req, res, blobs, info, {
        cacheControl: `private, max-age=${Math.max(0, Math.min(remaining, 3600))}`,
        filename: owner.isMain ? owner.originalName : null,
      });
    }),
  };
}
