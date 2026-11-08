import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import type { BlobService, BlobStreamInfo } from '../services/BlobService';
import { parseRangeHeader } from './streams';

/**
 * Streams a stored blob with HTTP range support, so browsers can seek video
 * and audio and external tools can resume downloads. Blob ids never change
 * content, so the id is a strong ETag.
 */
export async function sendBlob(
  req: Request,
  res: Response,
  blobs: BlobService,
  info: BlobStreamInfo,
  options: { cacheControl: string; filename?: string | null }
): Promise<void> {
  const size = info.meta.byteSize;
  const etag = `"${info.meta.id}"`;
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', options.cacheControl);
  res.setHeader('Content-Type', info.meta.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const safeName = (options.filename ?? '').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  res.setHeader('Content-Disposition', safeName ? `inline; filename="${safeName}"` : 'inline');

  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }

  const ifRange = req.headers['if-range'];
  const range = ifRange && ifRange !== etag ? null : parseRangeHeader(req.headers.range, size);
  if (range === 'unsatisfiable') {
    res.setHeader('Content-Range', `bytes */${size}`);
    res.status(416).end();
    return;
  }

  const stream = await blobs.openStream(info, range ?? undefined);
  if (range) {
    res.status(206);
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    res.setHeader('Content-Length', String(range.end - range.start + 1));
  } else {
    res.status(200);
    res.setHeader('Content-Length', String(size));
  }
  if (req.method === 'HEAD') {
    stream.destroy();
    res.end();
    return;
  }
  try {
    await pipeline(stream, res);
  } catch {
    // Client went away mid-download (common while seeking); nothing to report.
    stream.destroy();
  }
}
