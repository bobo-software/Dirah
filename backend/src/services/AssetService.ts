import { and, arrayContains, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { assets, blobs, pages, workspaces, type AssetGeneration } from '../db/schemas';
import { HttpError } from '../utils/HttpError';
import { displayName, MEDIA_SNIFF_BYTES, sniffMedia, type MediaKind } from '../utils/mediaType';
import { safeFetch } from '../utils/safeFetch';
import { normalizeDocsSearchQuery } from '../utils/slugify';
import type { AuthService, Database } from './AuthService';
import type { BlobService } from './BlobService';
import type { MediaProcessingService } from './MediaProcessingService';
import type { MediaUrlService, SignedMediaUrl } from './MediaUrlService';
import type { PageService } from './PageService';

/** What a reference is for when generating: lets agents pick e.g. all character refs. */
export const ASSET_ROLES = [
  'character',
  'style',
  'location',
  'prop',
  'motion',
  'audio',
  'storyboard',
  'generated',
  'other',
] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];
export const ASSET_STATUSES = ['processing', 'ready', 'failed'] as const;

const MAX_TAGS = 32;
const MAX_TAG_LENGTH = 48;

export interface AssetView {
  id: string;
  workspaceId: string;
  title: string;
  slug: string | null;
  parentId: string | null;
  mediaType: MediaKind;
  mime: string;
  ext: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  fps: number | null;
  hasAudio: boolean | null;
  role: AssetRole;
  tags: string[];
  description: string;
  promptHint: string;
  sourceUrl: string | null;
  license: string | null;
  originalName: string | null;
  generation: AssetGeneration | null;
  status: (typeof ASSET_STATUSES)[number];
  error: string | null;
  blobId: string;
  thumbnailBlobId: string | null;
  previewBlobId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AssetMetadataInput {
  title?: string;
  description?: string;
  tags?: string[];
  role?: string;
  promptHint?: string;
  sourceUrl?: string | null;
  license?: string | null;
  generation?: AssetGeneration | null;
}

export interface AssetSearchInput {
  query?: string;
  mediaType?: MediaKind;
  role?: string;
  tags?: string[];
  status?: string;
  /** Limit to these parent folders (already expanded to every descendant folder). */
  parentIds?: Array<string | null>;
  limit?: number;
  offset?: number;
}

export interface AssetLinks {
  url: SignedMediaUrl;
  thumbnailUrl: SignedMediaUrl | null;
  previewUrl: SignedMediaUrl | null;
}

const assetColumns = {
  id: pages.id,
  workspaceId: pages.workspaceId,
  title: pages.title,
  slug: pages.slug,
  parentId: pages.parentId,
  deletedAt: pages.deletedAt,
  mediaType: assets.mediaType,
  mime: assets.mime,
  ext: assets.ext,
  byteSize: blobs.byteSize,
  width: assets.width,
  height: assets.height,
  durationMs: assets.durationMs,
  fps: assets.fps,
  hasAudio: assets.hasAudio,
  role: assets.role,
  tags: assets.tags,
  description: assets.description,
  promptHint: assets.promptHint,
  sourceUrl: assets.sourceUrl,
  license: assets.license,
  originalName: assets.originalName,
  generation: assets.generation,
  status: assets.status,
  error: assets.error,
  blobId: assets.blobId,
  thumbnailBlobId: assets.thumbnailBlobId,
  previewBlobId: assets.previewBlobId,
  createdAt: assets.createdAt,
  updatedAt: assets.updatedAt,
};

export function normalizeTags(raw: string[] | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const seen = new Set<string>();
  for (const tag of raw) {
    const clean = tag.trim().toLowerCase().replace(/\s+/g, '-').slice(0, MAX_TAG_LENGTH);
    if (clean) seen.add(clean);
    if (seen.size >= MAX_TAGS) break;
  }
  return [...seen];
}

function normalizeRole(raw: string | undefined): AssetRole | undefined {
  if (raw === undefined) return undefined;
  const role = raw.trim().toLowerCase();
  if (!ASSET_ROLES.includes(role as AssetRole)) {
    throw new HttpError(`role must be one of ${ASSET_ROLES.join(', ')}`, 400, 'INVALID_ROLE');
  }
  return role as AssetRole;
}

function optionalText(raw: string | null | undefined, max: number): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const trimmed = raw.trim().slice(0, max);
  return trimmed || null;
}

/** Text indexed by the page's full-text search column. */
export function assetSearchText(input: {
  title: string;
  description: string;
  tags: string[];
  role: string;
  promptHint: string;
  mediaType: string;
  originalName?: string | null;
  generation?: AssetGeneration | null;
}): string {
  return [
    input.title,
    input.description,
    input.tags.join(' '),
    input.tags.map((tag) => tag.replace(/-/g, ' ')).join(' '),
    input.role,
    input.mediaType,
    input.promptHint,
    input.originalName ?? '',
    input.generation?.prompt ?? '',
    input.generation?.model ?? '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 200_000);
}

/** Media files (images, video, audio) kept as `asset` nodes in the docs tree. */
export class AssetService {
  constructor(
    private readonly database: Database,
    private readonly auth: AuthService,
    private readonly pages: PageService,
    private readonly blobs: BlobService,
    private readonly processing: MediaProcessingService,
    private readonly urls: MediaUrlService,
    private readonly options: { maxBytes: number }
  ) {
    pages.onBeforePurge((ids) => this.purge(ids));
  }

  get maxBytes(): number {
    return this.options.maxBytes;
  }

  /** Streams an uploaded file into a new asset under `parentId`. */
  async upload(
    userId: string,
    workspaceId: string,
    input: {
      source: AsyncIterable<Buffer | Uint8Array | string>;
      filename?: string | null;
      title?: string;
      parentId?: string | null;
      metadata?: AssetMetadataInput;
      sourceUrl?: string | null;
    }
  ): Promise<AssetView> {
    await this.auth.requireEditor(userId, workspaceId);
    if (await this.pages.isWorkspaceEncrypted(workspaceId)) {
      throw new HttpError('Media assets are not available in end-to-end encrypted workspaces', 400, 'E2E_NO_ASSETS');
    }
    const role = normalizeRole(input.metadata?.role) ?? 'other';
    const tags = normalizeTags(input.metadata?.tags) ?? [];
    const { blob, sniffed } = await this.blobs.uploadStream({
      userId,
      workspaceId,
      source: input.source,
      maxBytes: this.options.maxBytes,
      headBytes: MEDIA_SNIFF_BYTES,
      sniff: sniffMedia,
    });
    const title = (input.title ?? input.metadata?.title ?? '').trim() || displayName(input.filename, sniffed.ext);
    const description = input.metadata?.description?.trim().slice(0, 10_000) ?? '';
    const promptHint = input.metadata?.promptHint?.trim().slice(0, 4_000) ?? '';
    const generation = input.metadata?.generation ?? null;
    const originalName = input.filename?.trim().slice(0, 200) || null;
    let page;
    try {
      page = await this.pages.createAsset(
        userId,
        workspaceId,
        { title, parentId: input.parentId ?? null, ext: sniffed.ext },
        async (tx, pageId) => {
          await tx.insert(assets).values({
            pageId,
            workspaceId,
            blobId: blob.id,
            mediaType: sniffed.mediaType,
            mime: sniffed.mime,
            ext: sniffed.ext,
            originalName,
            role,
            tags,
            description,
            promptHint,
            sourceUrl: optionalText(input.sourceUrl ?? input.metadata?.sourceUrl, 2_000) ?? null,
            license: optionalText(input.metadata?.license, 500) ?? null,
            generation,
            status: 'processing',
            createdBy: userId,
          });
          await tx
            .update(pages)
            .set({
              searchText: assetSearchText({
                title,
                description,
                tags,
                role,
                promptHint,
                mediaType: sniffed.mediaType,
                originalName,
                generation,
              }),
            })
            .where(eq(pages.id, pageId));
        }
      );
    } catch (error) {
      await this.blobs.removeUnchecked([blob.id]);
      throw error;
    }
    this.processing.enqueue(page.id);
    return this.requireView(page.id);
  }

  /** Fetches a public https URL (e.g. a generator's output) into a new asset. */
  async importFromUrl(
    userId: string,
    workspaceId: string,
    input: { url: string; title?: string; parentId?: string | null; metadata?: AssetMetadataInput }
  ): Promise<AssetView> {
    await this.auth.requireEditor(userId, workspaceId);
    const fetched = await safeFetch(input.url, { maxBytes: this.options.maxBytes });
    try {
      return await this.upload(userId, workspaceId, {
        source: fetched.response,
        filename: fetched.filename,
        title: input.title,
        parentId: input.parentId,
        metadata: input.metadata,
        sourceUrl: input.metadata?.sourceUrl ?? input.url,
      });
    } finally {
      fetched.response.destroy();
    }
  }

  async get(userId: string, pageId: string): Promise<AssetView> {
    const page = await this.pages.requireMemberPage(userId, pageId);
    if (page.kind !== 'asset') throw new HttpError('Not a media asset', 400, 'NOT_ASSET');
    return this.requireView(pageId);
  }

  async update(userId: string, pageId: string, input: AssetMetadataInput): Promise<AssetView> {
    const page = await this.pages.requireEditorPage(userId, pageId);
    if (page.kind !== 'asset') throw new HttpError('Not a media asset', 400, 'NOT_ASSET');
    if (input.title !== undefined && input.title.trim() !== page.title) {
      await this.pages.patch(userId, pageId, { title: input.title });
    }
    const set: Partial<typeof assets.$inferInsert> = { updatedAt: new Date() };
    if (input.description !== undefined) set.description = input.description.trim().slice(0, 10_000);
    if (input.promptHint !== undefined) set.promptHint = input.promptHint.trim().slice(0, 4_000);
    const tags = normalizeTags(input.tags);
    if (tags !== undefined) set.tags = tags;
    const role = normalizeRole(input.role);
    if (role !== undefined) set.role = role;
    const sourceUrl = optionalText(input.sourceUrl, 2_000);
    if (sourceUrl !== undefined) set.sourceUrl = sourceUrl;
    const license = optionalText(input.license, 500);
    if (license !== undefined) set.license = license;
    if (input.generation !== undefined) set.generation = input.generation;
    await this.database.update(assets).set(set).where(eq(assets.pageId, pageId));
    const view = await this.requireView(pageId);
    await this.pages.setSearchText(pageId, assetSearchText(view));
    return view;
  }

  /** Re-runs thumbnail/preview generation, e.g. after a failure. */
  async reprocess(userId: string, pageId: string): Promise<AssetView> {
    const page = await this.pages.requireEditorPage(userId, pageId);
    if (page.kind !== 'asset') throw new HttpError('Not a media asset', 400, 'NOT_ASSET');
    await this.database
      .update(assets)
      .set({ status: 'processing', error: null, updatedAt: new Date() })
      .where(eq(assets.pageId, pageId));
    this.processing.enqueue(pageId);
    return this.requireView(pageId);
  }

  async search(
    userId: string,
    workspaceId: string,
    input: AssetSearchInput
  ): Promise<{ assets: AssetView[]; total: number }> {
    await this.auth.requireMember(userId, workspaceId);
    const conditions: SQL[] = [eq(pages.workspaceId, workspaceId), isNull(pages.deletedAt), eq(pages.kind, 'asset')];
    if (input.mediaType) conditions.push(eq(assets.mediaType, input.mediaType));
    if (input.role) conditions.push(eq(assets.role, normalizeRole(input.role)!));
    if (input.status) conditions.push(eq(assets.status, input.status));
    const tags = normalizeTags(input.tags);
    if (tags?.length) conditions.push(arrayContains(assets.tags, tags));
    if (input.parentIds) {
      const ids = input.parentIds.filter((id): id is string => id !== null);
      const includeRoot = input.parentIds.includes(null);
      const parts: SQL[] = [];
      if (ids.length) parts.push(inArray(pages.parentId, ids));
      if (includeRoot) parts.push(isNull(pages.parentId));
      if (!parts.length) return { assets: [], total: 0 };
      conditions.push(parts.length === 1 ? parts[0] : or(...parts)!);
    }
    let rank: SQL | undefined;
    const parsed = input.query ? normalizeDocsSearchQuery(input.query) : null;
    if (parsed) {
      const tagWords = parsed.raw
        .toLowerCase()
        .split(/[\s,]+/)
        .map((word) => word.trim())
        .filter(Boolean);
      conditions.push(
        or(
          ilike(pages.title, `%${parsed.raw}%`),
          sql`pages.search_tsv @@ plainto_tsquery('english', ${parsed.fts})`,
          tagWords.length ? sql`${assets.tags} && ${sql.param(tagWords)}::text[]` : undefined
        )!
      );
      rank = sql`ts_rank(pages.search_tsv, plainto_tsquery('english', ${parsed.fts}))`;
    }
    const limit = Math.min(100, Math.max(1, input.limit ?? 30));
    const offset = Math.max(0, input.offset ?? 0);
    const where = and(...conditions);
    const [rows, [{ count }]] = await Promise.all([
      this.database
        .select(assetColumns)
        .from(assets)
        .innerJoin(pages, eq(pages.id, assets.pageId))
        .innerJoin(blobs, eq(blobs.id, assets.blobId))
        .where(where)
        .orderBy(...(rank ? [desc(rank)] : []), desc(assets.createdAt))
        .limit(limit)
        .offset(offset),
      this.database
        .select({ count: sql<number>`count(*)::int` })
        .from(assets)
        .innerJoin(pages, eq(pages.id, assets.pageId))
        .where(where),
    ]);
    return { assets: rows.map((row) => this.toView(row)), total: count };
  }

  /** Temporary links to an asset's file, thumbnail and agent preview. */
  links(asset: AssetView, ttlSeconds?: number): AssetLinks {
    return {
      url: this.urls.sign(asset.blobId, ttlSeconds),
      thumbnailUrl: asset.thumbnailBlobId ? this.urls.sign(asset.thumbnailBlobId, ttlSeconds) : null,
      previewUrl: asset.previewBlobId ? this.urls.sign(asset.previewBlobId, ttlSeconds) : null,
    };
  }

  /** The agent preview image bytes (image preview, video contact sheet or audio waveform). */
  async previewBytes(asset: AssetView): Promise<{ body: Buffer; mime: string } | null> {
    if (!asset.previewBlobId) return null;
    const { meta, body } = await this.blobs.readUnchecked(asset.previewBlobId);
    return { body, mime: meta.mime };
  }

  /**
   * The live asset whose file, thumbnail or preview is `blobId`, or null when
   * there is none, it is in the trash, or its workspace is deleted or encrypted.
   * Gates the unauthenticated signed links.
   */
  async findServableByBlob(blobId: string): Promise<{ pageId: string; originalName: string | null; ext: string; isMain: boolean } | null> {
    const [row] = await this.database
      .select({
        pageId: assets.pageId,
        originalName: assets.originalName,
        ext: assets.ext,
        mainBlobId: assets.blobId,
        slug: pages.slug,
      })
      .from(assets)
      .innerJoin(pages, eq(pages.id, assets.pageId))
      .innerJoin(workspaces, eq(workspaces.id, assets.workspaceId))
      .where(
        and(
          or(eq(assets.blobId, blobId), eq(assets.thumbnailBlobId, blobId), eq(assets.previewBlobId, blobId)),
          isNull(pages.deletedAt),
          isNull(workspaces.deletedAt),
          eq(workspaces.encrypted, false)
        )
      )
      .limit(1);
    if (!row) return null;
    return {
      pageId: row.pageId,
      originalName: row.slug ?? row.originalName,
      ext: row.ext,
      isMain: row.mainBlobId === blobId,
    };
  }

  /** Deletes the media rows and stored files of pages about to be purged. */
  private async purge(pageIds: string[]): Promise<void> {
    if (!pageIds.length) return;
    const removed = await this.database
      .delete(assets)
      .where(inArray(assets.pageId, pageIds))
      .returning({ blobId: assets.blobId, thumb: assets.thumbnailBlobId, preview: assets.previewBlobId });
    const blobIds = removed.flatMap((row) => [row.blobId, row.thumb, row.preview]).filter((id): id is string => Boolean(id));
    if (blobIds.length) await this.blobs.removeUnchecked(blobIds);
  }

  /** An asset by id with no access check. The caller has checked access to its blob or page. */
  view(pageId: string): Promise<AssetView> {
    return this.requireView(pageId);
  }

  private async requireView(pageId: string): Promise<AssetView> {
    const [row] = await this.database
      .select(assetColumns)
      .from(assets)
      .innerJoin(pages, eq(pages.id, assets.pageId))
      .innerJoin(blobs, eq(blobs.id, assets.blobId))
      .where(eq(assets.pageId, pageId))
      .limit(1);
    if (!row) throw new HttpError('Asset not found', 404, 'ASSET_NOT_FOUND');
    return this.toView(row);
  }

  private toView(row: Record<keyof typeof assetColumns, unknown>): AssetView {
    return {
      ...(row as unknown as AssetView),
      mediaType: row.mediaType as MediaKind,
      role: (ASSET_ROLES.includes(row.role as AssetRole) ? row.role : 'other') as AssetRole,
      status: row.status as AssetView['status'],
      tags: (row.tags as string[] | null) ?? [],
      generation: (row.generation as AssetGeneration | null) ?? null,
    };
  }
}
