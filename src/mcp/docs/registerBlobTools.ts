import { z } from 'zod';
import { HttpError } from '../../utils/HttpError';
import { MAX_MCP_IMAGE_BYTES, type BlobsMcpService, type McpImage } from '../../services/BlobsMcpService';
import type { PgMcpServerHost } from '../registerPgTools';
import { currentDocsAuth } from './authContext';

const REASON_TEXT: Record<NonNullable<McpImage['reason']>, string> = {
  not_an_image: 'This attachment is not an image, so it cannot be shown. Only its details are returned.',
  unsupported_image_type: 'This image type (e.g. HEIC) cannot be shown to agents. Only its details are returned.',
  too_large: `This image is larger than ${MAX_MCP_IMAGE_BYTES / (1024 * 1024)} MB, so it is not returned inline.`,
};

function toContent(image: McpImage) {
  const viewable = image.body !== null;
  const data = {
    blobId: image.blobId,
    workspaceId: image.workspaceId,
    url: image.url,
    mimeType: image.mimeType,
    byteSize: image.byteSize,
    viewable,
    ...(image.reason ? { reason: image.reason, message: REASON_TEXT[image.reason] } : {}),
  };
  const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [
    { type: 'text', text: JSON.stringify({ success: true, data }, null, 2) },
  ];
  if (image.body) {
    content.push({ type: 'image', data: image.body.toString('base64'), mimeType: image.mimeType });
  }
  return { content };
}

function toError(error: unknown) {
  const message = error instanceof HttpError ? error.message : error instanceof Error ? error.message : 'MCP tool failed';
  const code = error instanceof HttpError ? error.code : undefined;
  const details = error instanceof HttpError ? error.details : undefined;
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ success: false, message, error: code, details }, null, 2),
      },
    ],
    isError: true,
  };
}

export function registerBlobTools(server: PgMcpServerHost, service: BlobsMcpService): void {
  server.registerTool(
    'read_image',
    {
      title: 'Read image',
      description:
        'Open an image linked in a ticket, note or page. Images appear in markdown as ![alt](/api/blobs/<id>) and in the attachments list of read_ticket, read_note and read_file. Pass that url (or the blobId). Returns the image (PNG, JPEG, GIF, WebP up to 5 MB) plus its details; other files return details only.',
      inputSchema: z.object({
        url: z.string().min(1).max(2_000).optional().describe('Image link, e.g. /api/blobs/<id>'),
        blobId: z.string().min(1).max(128).optional().describe('Blob id, when you have it instead of the url'),
      }),
    },
    (async (args: { url?: string; blobId?: string }) => {
      const auth = currentDocsAuth();
      let workspaceId: string | null = null;
      try {
        const image = await service.readImage(auth.userId, auth.tokenId, args.url ?? args.blobId ?? '', (id) => {
          workspaceId = id;
        });
        void service.recordAudit({
          userId: auth.userId,
          tokenId: auth.tokenId,
          workspaceId,
          tool: 'read_image',
          outcome: 'ok',
        });
        return toContent(image);
      } catch (error) {
        void service.recordAudit({
          userId: auth.userId,
          tokenId: auth.tokenId,
          workspaceId,
          tool: 'read_image',
          outcome: (error instanceof HttpError ? error.code : undefined) ?? 'error',
        });
        return toError(error);
      }
    }) as never
  );
}
