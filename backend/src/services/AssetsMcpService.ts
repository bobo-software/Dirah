import { HttpError } from '../utils/HttpError';
import type { MediaKind } from '../utils/mediaType';
import type { AssetMetadataInput, AssetService, AssetView } from './AssetService';
import type { DocsMcpService } from './DocsMcpService';
import { contactSheetTimesMs } from './MediaProcessingService';

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
    status: asset.status,
  };
}

/** MCP face of media assets: find references, look at them, and hand generators temporary links. */
export class AssetsMcpService {
  constructor(
    private readonly assets: AssetService,
    private readonly docs: DocsMcpService
  ) {}

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
      asset.mediaType === 'video' ? 'contact_sheet' : asset.mediaType === 'audio' ? 'waveform' : 'image';
    return {
      data: {
        ...summary(asset, path),
        description: asset.description,
        byteSize: asset.byteSize,
        fps: asset.fps ?? undefined,
        hasAudio: asset.hasAudio ?? undefined,
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
      const link = this.assets.links(asset, input.ttlSeconds).url;
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
