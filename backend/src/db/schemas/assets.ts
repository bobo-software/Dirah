import { boolean, index, integer, jsonb, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { blobs } from './docs';
import { pages } from './pages';
import { users } from './users';
import { workspaces } from './workspaces';

/** Provenance recorded when an asset is the output of a generation run. */
export type AssetGeneration = {
  model?: string;
  prompt?: string;
  sourceAssetIds?: string[];
  params?: Record<string, unknown>;
};

export type AssetModelInfo = {
  objects?: number;
  rigged?: boolean;
  animations?: string[];
  materials?: number;
};

/** A single-use link an MCP agent PUTs a large file to. */
export const assetUploadIntents = pgTable('asset_upload_intents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id'),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references(() => pages.id, { onDelete: 'set null' }),
  filename: text('filename').notNull(),
  title: text('title'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  assetPageId: uuid('asset_page_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A media file kept in the docs tree. The page row (kind 'asset') holds its title, slug and place. */
export const assets = pgTable(
  'assets',
  {
    pageId: uuid('page_id')
      .primaryKey()
      .references(() => pages.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    blobId: text('blob_id')
      .notNull()
      .references(() => blobs.id, { onDelete: 'restrict' }),
    mediaType: text('media_type').notNull(),
    mime: text('mime').notNull(),
    ext: text('ext').notNull(),
    originalName: text('original_name'),
    width: integer('width'),
    height: integer('height'),
    durationMs: integer('duration_ms'),
    fps: real('fps'),
    hasAudio: boolean('has_audio'),
    thumbnailBlobId: text('thumbnail_blob_id').references(() => blobs.id, { onDelete: 'set null' }),
    previewBlobId: text('preview_blob_id').references(() => blobs.id, { onDelete: 'set null' }),
    role: text('role').notNull().default('other'),
    tags: text('tags').array().notNull().default([]),
    description: text('description').notNull().default(''),
    promptHint: text('prompt_hint').notNull().default(''),
    sourceUrl: text('source_url'),
    license: text('license'),
    generation: jsonb('generation').$type<AssetGeneration>(),
    vertexCount: integer('vertex_count'),
    triangleCount: integer('triangle_count'),
    /** Model size in metres: { x, y, z }. */
    bbox: jsonb('bbox').$type<{ x: number; y: number; z: number }>(),
    /** Rig and animation details read by the renderer. */
    modelInfo: jsonb('model_info').$type<AssetModelInfo>(),
    status: text('status').notNull().default('processing'),
    error: text('error'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    workspaceIdx: index('assets_workspace_idx').on(table.workspaceId, table.mediaType),
  })
);
