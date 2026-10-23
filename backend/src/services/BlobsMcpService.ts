import { HttpError } from '../utils/HttpError';
import { isValidBlobId } from '../utils/blobRefs';
import type { BlobService, PublicBlob } from './BlobService';
import type { DocsMcpService } from './DocsMcpService';

/** Largest image returned inline; base64 adds a third on top of this. */
export const MAX_MCP_IMAGE_BYTES = 5 * 1024 * 1024;

/** Image types MCP clients can render. HEIC is stored but not viewable by agents. */
const VIEWABLE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export type ImageUnavailableReason = 'not_an_image' | 'unsupported_image_type' | 'too_large';

export interface McpImage {
  blobId: string;
  workspaceId: string;
  mimeType: string;
  byteSize: number;
  url: string;
  /** Bytes when the image can be shown to the agent; null with a reason otherwise. */
  body: Buffer | null;
  reason: ImageUnavailableReason | null;
}

const BLOB_PATH = /^(?:https?:\/\/[^/]+)?\/api\/blobs\/([^/?#]+)(?:[?#].*)?$/;

function notFound(): HttpError {
  return new HttpError('Blob not found', 404, 'BLOB_NOT_FOUND');
}

/** The blob id in `/api/blobs/:id`, a full URL to it, or a bare id. */
export function parseBlobRef(ref: string): string {
  const trimmed = ref.trim();
  const id = BLOB_PATH.exec(trimmed)?.[1] ?? trimmed;
  if (!isValidBlobId(id)) {
    throw new HttpError('Expected an image link like /api/blobs/<id> or a blob id', 400, 'INVALID_BLOB_REF');
  }
  return id;
}

export function blobUrl(blobId: string): string {
  return `/api/blobs/${blobId}`;
}

function unavailableReason(meta: PublicBlob): ImageUnavailableReason | null {
  const mime = meta.mime.toLowerCase();
  if (!mime.startsWith('image/')) return 'not_an_image';
  if (!VIEWABLE_IMAGE_TYPES.has(mime)) return 'unsupported_image_type';
  if (meta.byteSize > MAX_MCP_IMAGE_BYTES) return 'too_large';
  return null;
}

/** MCP face of workspace blobs: lets agents open images linked from tickets, notes and pages. */
export class BlobsMcpService {
  constructor(
    private readonly blobs: BlobService,
    private readonly docs: DocsMcpService
  ) {}

  recordAudit(entry: Parameters<DocsMcpService['recordAudit']>[0]): Promise<void> {
    return this.docs.recordAudit(entry);
  }

  async readImage(
    userId: string,
    tokenId: string | null,
    ref: string,
    onWorkspace?: (workspaceId: string) => void
  ): Promise<McpImage> {
    const blobId = parseBlobRef(ref);
    let found: { meta: PublicBlob; body: Buffer };
    try {
      found = await this.blobs.get(userId, blobId);
    } catch (error) {
      // Not a member of the blob's workspace looks the same as a missing blob.
      if (error instanceof HttpError && (error.status === 403 || error.status === 404)) throw notFound();
      throw error;
    }
    onWorkspace?.(found.meta.workspaceId);
    try {
      await this.docs.requireWorkspaceAccess(userId, tokenId, found.meta.workspaceId, false);
    } catch (error) {
      if (error instanceof HttpError && error.code === 'MCP_NOT_ALLOWLISTED') throw notFound();
      throw error;
    }
    const reason = unavailableReason(found.meta);
    return {
      blobId: found.meta.id,
      workspaceId: found.meta.workspaceId,
      mimeType: found.meta.mime,
      byteSize: found.meta.byteSize,
      url: blobUrl(found.meta.id),
      body: reason ? null : found.body,
      reason,
    };
  }
}
