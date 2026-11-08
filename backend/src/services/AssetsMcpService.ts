import { Readable } from 'node:stream';
import { HttpError } from '../utils/HttpError';
import type { MediaKind } from '../utils/mediaType';
import type { AssetMetadataInput, AssetService, AssetView } from './AssetService';
import type { DocsMcpService } from './DocsMcpService';
import { contactSheetTimesMs, TURNAROUND_VIEWS } from './MediaProcessingService';
import type { MediaUrlService } from './MediaUrlService';

export interface AssetRef {
  path?: string;
  nodeId?: string;
}

export interface McpAssetResult {
  data: Record<string, unknown>;
  /** The agent preview image (image, video contact sheet or audio waveform) to return inline. */
  image: { body: Buffer; mime: string } | null;
}

function summary(asset: AssetView, path: string | null) {
  return {
    id: asset.id,
    path,
    title: asset.title,
    mediaType: asset.mediaType,
    mime: asset.mime,
    role: asset.role,
    tags: asset.tags,
    description: asset.description ? asset.description.slice(0, 300) : undefined,
    promptHint: asset.promptHint || undefined,
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
    durationMs: asset.durationMs ?? undefined,
    triangleCount: asset.triangleCount ?? undefined,
    status: asset.status,
  };
}

/** A file name safe to store: no path, no control characters. */
function cleanFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
  if (!clean) throw new HttpError('filename is required', 400, 'INVALID_FILENAME');
  return clean;
}

export interface McpUploadOptions {
  inlineMaxBytes: number;
  uploadLinkTtlSeconds: number;
}

/** MCP face of media assets: find references, look at them, and hand generators temporary links. */
export class AssetsMcpService {
  constructor(
    private readonly assets: AssetService,
    private readonly docs: DocsMcpService,
    private readonly mediaUrls?: MediaUrlService,
    private readonly uploads: McpUploadOptions = { inlineMaxBytes: 10 * 1024 * 1024, uploadLinkTtlSeconds: 900 }
  ) {}

  /** Stores a small file sent inline as base64. */
  async uploadInline(
    userId: string,
    tokenId: string | null,
    workspaceId: string,
    input: { filename: string; data: string; folder?: string; title?: string; metadata: AssetMetadataInput }
  ) {
    await this.docs.requireWorkspaceAccess(userId, tokenId, workspaceId, true);
    const filename = cleanFilename(input.filename);
    const b64 = input.data.replace(/^data:[^;,]+;base64,/, '').replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(b64)) {
      throw new HttpError('data must be base64', 400, 'INVALID_BASE64');
    }
    const approxBytes = Math.floor((b64.length * 3) / 4);
    if (approxBytes > this.uploads.inlineMaxBytes) {
      throw new HttpError(
        `Inline uploads are limited to ${Math.round(this.uploads.inlineMaxBytes / (1024 * 1024))} MB; use create_asset_upload for larger files`,
        413,
        'INLINE_TOO_LARGE'
      );
    }
    const body = Buffer.from(b64, 'base64');
    if (!body.length) throw new HttpError('data is empty', 400, 'EMPTY_BLOB');
    const parentId = await this.docs.folderAt(userId, workspaceId, input.folder, true);
    const asset = await this.assets.upload(userId, workspaceId, {
      source: Readable.from([body]),
      filename,
      title: input.title,
      parentId,
      metadata: input.metadata,
    });
    return this.afterWrite(userId, tokenId, workspaceId, asset);
  }

  /** A single-use link the agent PUTs a large file to (curl -T). */
  async createUpload(
    userId: string,
    tokenId: string | null,
    workspaceId: string,
    input: { filename: string; folder?: string; title?: string; byteSize?: number; metadata: AssetMetadataInput }
  ) {
    if (!this.mediaUrls) throw new HttpError('Upload links are not configured', 503, 'UPLOADS_UNAVAILABLE');
    await this.docs.requireWorkspaceAccess(userId, tokenId, workspaceId, true);
    const filename = cleanFilename(input.filename);
    if (input.byteSize && input.byteSize > this.assets.maxBytes) {
      throw new HttpError(
        `File is larger than ${Math.round(this.assets.maxBytes / (1024 * 1024))} MB`,
        413,
        'BLOB_TOO_LARGE'
      );
    }
    const parentId = await this.docs.folderAt(userId, workspaceId, input.folder, true);
    const intent = await this.assets.createUploadIntent({
      userId,
      tokenId,
      workspaceId,
      parentId,
      filename,
      title: input.title,
      metadata: input.metadata,
      ttlSeconds: this.uploads.uploadLinkTtlSeconds,
    });
    const link = this.mediaUrls.signUpload(intent.id, this.uploads.uploadLinkTtlSeconds);
    const quoted = filename.replace(/'/g, `'\\''`);
    return {
      uploadUrl: link.url,
      method: 'PUT',
      expiresAt: link.expiresAt,
      maxBytes: this.assets.maxBytes,
      singleUse: true,
      curl: `curl --fail -T '${quoted}' '${link.url}'`,
      note: 'Send the raw file bytes as the request body. The response is the stored asset. The link works once.',
    };
  }

  /** Completes an upload link: checks the link, the user and the token again, then stores the body. */
  async completeUpload(token: string, source: AsyncIterable<Buffer | Uint8Array | string>) {
    if (!this.mediaUrls) throw new HttpError('Upload links are not configured', 503, 'UPLOADS_UNAVAILABLE');
    const intentId = this.mediaUrls.verifyUpload(token);
    if (!intentId) throw new HttpError('This upload link is invalid or has expired', 403, 'UPLOAD_LINK_INVALID');
    const intent = await this.assets.claimUploadIntent(intentId);
    if (!intent) {
      throw new HttpError('This upload link was already used or has expired; ask for a new one', 410, 'UPLOAD_LINK_USED');
    }
    // Access may have changed since the link was made.
    await this.docs.requireWorkspaceAccess(intent.userId, intent.tokenId, intent.workspaceId, true);
    const asset = await this.assets.upload(intent.userId, intent.workspaceId, {
      source,
      filename: intent.filename,
      title: intent.title ?? undefined,
      parentId: intent.parentId,
      metadata: intent.metadata as AssetMetadataInput,
    });
    await this.assets.recordUploadResult(intent.id, asset.id);
    void this.docs.recordAudit({
      userId: intent.userId,
      tokenId: intent.tokenId,
      workspaceId: intent.workspaceId,
      tool: 'create_asset_upload:put',
      outcome: 'ok',
    });
    return this.afterWrite(intent.userId, intent.tokenId, intent.workspaceId, asset);
  }

  recordAudit(entry: Parameters<DocsMcpService['recordAudit']>[0]): Promise<void> {
    return this.docs.recordAudit(entry);
  }

  resolveWorkspace(userId: string, tokenId: string | null, ref: string | undefined, defaultWorkspaceId: string | null) {
    return this.docs.resolveWorkspace(userId, tokenId, ref, { defaultWorkspaceId });
  }

  async search(
    userId: string,
    tokenId: string | null,
    workspaceId: string,
    input: {
      query?: string;
      mediaType?: MediaKind;
      role?: string;
      tags?: string[];
      folder?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const tree = await this.docs.treeNodes(userId, tokenId, workspaceId);
    let parentIds: Array<string | null> | undefined;
    if (input.folder) {
      const prefix = input.folder.replace(/^\/+|\/+$/g, '').toLowerCase();
      parentIds = tree
        .filter((node) => node.kind === 'folder' && (node.path === prefix || node.path.startsWith(`${prefix}/`)))
        .map((node) => node.id);
      if (!parentIds.length) throw new HttpError(`Folder not found: ${input.folder}`, 404, 'DOCS_NOT_FOUND');
    }
    const result = await this.assets.search(userId, workspaceId, { ...input, parentIds });
    const pathById = new Map(tree.map((node) => [node.id, node.path]));
    return {
      total: result.total,
      offset: input.offset ?? 0,
      assets: result.assets.map((asset) => summary(asset, pathById.get(asset.id) ?? null)),
    };
  }

  async get(
    userId: string,
    tokenId: string | null,
    workspaceId: string,
    input: AssetRef & { ttlSeconds?: number; includePreview?: boolean }
  ): Promise<McpAssetResult> {
    await this.docs.requireWorkspaceAccess(userId, tokenId, workspaceId, false);
    const page = await this.docs.resolveNode(userId, workspaceId, input, 'asset');
    const asset = await this.assets.get(userId, page.id);
    const tree = await this.docs.treeNodes(userId, tokenId, workspaceId);
    const path = tree.find((node) => node.id === asset.id)?.path ?? null;
    const links = this.assets.links(asset, input.ttlSeconds);
    const image = input.includePreview === false ? null : await this.assets.previewBytes(asset);
    const previewKind =
      asset.mediaType === 'video'
        ? 'contact_sheet'
        : asset.mediaType === 'audio'
          ? 'waveform'
          : asset.mediaType === 'model'
            ? 'turnaround'
            : 'image';
    return {
      data: {
        ...summary(asset, path),
        description: asset.description,
        byteSize: asset.byteSize,
        fps: asset.fps ?? undefined,
        hasAudio: asset.hasAudio ?? undefined,
        ...(asset.mediaType === 'model'
          ? {
              vertexCount: asset.vertexCount ?? undefined,
              triangleCount: asset.triangleCount ?? undefined,
              sizeMeters: asset.bbox ?? undefined,
              rigged: asset.modelInfo?.rigged,
              animations: asset.modelInfo?.animations?.length ? asset.modelInfo.animations : undefined,
              turnaroundUrl: links.previewUrl?.url,
            }
          : {}),
        sourceUrl: asset.sourceUrl ?? undefined,
        license: asset.license ?? undefined,
        generation: asset.generation ?? undefined,
        error: asset.error ?? undefined,
        url: links.url.url,
        urlExpiresAt: links.url.expiresAt,
        thumbnailUrl: links.thumbnailUrl?.url,
        previewUrl: links.previewUrl?.url,
        appUrl: this.docs.pageUrl(workspaceId, asset.id),
        preview: image
          ? {
              kind: previewKind,
              ...(asset.mediaType === 'model'
                ? { note: 'Four views in a 2x2 grid, left to right, top to bottom.', views: TURNAROUND_VIEWS }
                : {}),
              ...(asset.mediaType === 'video' && asset.durationMs
                ? {
                    note: 'Frames left to right, top to bottom, at these times (ms).',
                    frameTimesMs: contactSheetTimesMs(asset.durationMs),
                  }
                : {}),
            }
          : {
              kind: 'none',
              note:
                asset.status === 'processing'
                  ? 'The preview is still being made; try again shortly.'
                  : asset.status === 'failed'
                    ? 'No preview could be made for this file.'
                    : 'Preview not requested.',
            },
        createdAt: asset.createdAt,
      },
      image,
    };
  }

  async urls(
    userId: string,
    tokenId: string | null,
    workspaceId: string,
    input: { refs: AssetRef[]; ttlSeconds?: number }
  ) {
    await this.docs.requireWorkspaceAccess(userId, tokenId, workspaceId, false);
    const tree = await this.docs.treeNodes(userId, tokenId, workspaceId);
    const pathById = new Map(tree.map((node) => [node.id, node.path]));
    const out = [];
    for (const ref of input.refs) {
      const page = await this.docs.resolveNode(userId, workspaceId, ref, 'asset');
      const asset = await this.assets.get(userId, page.id);
      const links = this.assets.links(asset, input.ttlSeconds);
      const link = links.url;
      out.push({
        id: asset.id,
        path: pathById.get(asset.id) ?? null,
        title: asset.title,
        role: asset.role,
        mediaType: asset.mediaType,
        mime: asset.mime,
        width: asset.width ?? undefined,
        height: asset.height ?? undefined,
        durationMs: asset.durationMs ?? undefined,
        promptHint: asset.promptHint || undefined,
        url: link.url,
        // What to hand an image/video generator: a model's turnaround sheet, otherwise the file itself.
        referenceUrl: asset.mediaType === 'model' ? (links.previewUrl?.url ?? null) : link.url,
        expiresAt: link.expiresAt,
      });
    }
    return { assets: out };
  }

  async importAsset(
    userId: string,
    tokenId: string | null,
    workspaceId: string,
    input: { url: string; folder?: string; title?: string; metadata: AssetMetadataInput }
  ) {
    await this.docs.requireWorkspaceAccess(userId, tokenId, workspaceId, true);
    const parentId = await this.docs.folderAt(userId, workspaceId, input.folder, true);
    const asset = await this.assets.importFromUrl(userId, workspaceId, {
      url: input.url,
      title: input.title,
      parentId,
      metadata: input.metadata,
    });
    return this.afterWrite(userId, tokenId, workspaceId, asset);
  }

  async update(
    userId: string,
    tokenId: string | null,
    workspaceId: string,
    input: AssetRef & { metadata: AssetMetadataInput }
  ) {
    await this.docs.requireWorkspaceAccess(userId, tokenId, workspaceId, true);
    const page = await this.docs.resolveNode(userId, workspaceId, input, 'asset');
    const asset = await this.assets.update(userId, page.id, input.metadata);
    return this.afterWrite(userId, tokenId, workspaceId, asset);
  }

  private async afterWrite(userId: string, tokenId: string | null, workspaceId: string, asset: AssetView) {
    const tree = await this.docs.treeNodes(userId, tokenId, workspaceId);
    return {
      ...summary(asset, tree.find((node) => node.id === asset.id)?.path ?? null),
      description: asset.description,
      generation: asset.generation ?? undefined,
      appUrl: this.docs.pageUrl(workspaceId, asset.id),
    };
  }
}
