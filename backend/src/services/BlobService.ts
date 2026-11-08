import crypto from 'node:crypto';
import { and, eq, notExists } from 'drizzle-orm';
import { blobs, noteBlobs, notes } from '../db/schemas';
import { HttpError } from '../utils/HttpError';
import { isValidBlobId } from '../utils/blobRefs';
import { sniffImageMime } from '../utils/imageType';
import { type AuthService, type Database } from './AuthService';
import type { BlobStore } from '../blobs/blobStore';
import { blobObjectKey } from '../blobs/objectKey';
import type { ByteRange } from '../blobs/blobStore';
import type { Readable } from 'node:stream';
import { meterStream } from '../utils/streams';

export interface PublicBlob {
  id: string;
  workspaceId: string;
  mime: string;
  byteSize: number;
}

const MAX_BLOB_BYTES = 12 * 1024 * 1024;

export interface BlobStreamInfo {
  meta: PublicBlob;
  storageKey: string;
}

export class BlobService {
  constructor(
    private readonly database: Database,
    private readonly auth: AuthService,
    private readonly store: BlobStore
  ) {}

  get storeKind(): string {
    return this.store.kind;
  }

  async upload(
    userId: string,
    workspaceId: string,
    body: Buffer,
    mime: string,
    id?: string
  ): Promise<PublicBlob> {
    await this.auth.requireEditor(userId, workspaceId);
    this.assertSize(body);
    const contentHash = crypto.createHash('sha256').update(body).digest('hex');
    const [existing] = await this.database
      .select({
        id: blobs.id,
        workspaceId: blobs.workspaceId,
        mime: blobs.mime,
        byteSize: blobs.byteSize,
      })
      .from(blobs)
      .where(
        and(
          eq(blobs.workspaceId, workspaceId),
          eq(blobs.contentHash, contentHash),
          // A note's image stays private to the note, so a matching upload gets its own copy.
          notExists(this.database.select().from(noteBlobs).where(eq(noteBlobs.blobId, blobs.id)))
        )
      )
      .limit(1);
    if (existing) {
      return existing;
    }
    return this.write({ userId, workspaceId, body, contentHash, mime: mime || 'application/octet-stream', id });
  }

  /**
   * Stores an image attached to `note` and links it to that note, so only people
   * who can see the note can read it. The caller has checked that `userId` is
   * the note's author. Never de-duplicated against other blobs: reusing a ticket
   * or page image here would make it private to the note.
   */
  async uploadNoteImage(
    userId: string,
    note: { id: string; workspaceId: string },
    body: Buffer
  ): Promise<PublicBlob> {
    this.assertSize(body);
    const mime = sniffImageMime(body);
    if (!mime) {
      throw new HttpError('Only PNG, JPEG, GIF, WebP or HEIC images can be attached', 415, 'UNSUPPORTED_MEDIA_TYPE');
    }
    const contentHash = crypto.createHash('sha256').update(body).digest('hex');
    return this.write({ userId, workspaceId: note.workspaceId, body, contentHash, mime, noteId: note.id });
  }

  async get(userId: string, blobId: string): Promise<{ meta: PublicBlob; body: Buffer }> {
    const found = await this.lookup(blobId);
    await this.auth.requireMember(userId, found.meta.workspaceId);
    const access = await this.noteAccess(userId, blobId);
    if (access.linked && !access.visible) {
      throw new HttpError('Blob not found', 404, 'BLOB_NOT_FOUND');
    }
    return found;
  }

  async getInWorkspace(
    workspaceId: string,
    blobId: string
  ): Promise<{ meta: PublicBlob; body: Buffer }> {
    const found = await this.lookup(blobId);
    // Public share pages never serve note images: notes have no share links.
    if (found.meta.workspaceId !== workspaceId || (await this.noteAccess(null, blobId)).linked) {
      throw new HttpError('Blob not found', 404, 'BLOB_NOT_FOUND');
    }
    return found;
  }

  /**
   * Streams a large upload into the store without holding it in memory. The
   * caller has checked access. `sniff` names the type from the leading bytes,
   * or returns null to refuse the file. Never de-duplicated: the blob belongs to
   * one asset, so removing that asset can remove the blob.
   */
  async uploadStream<T extends { mime: string }>(input: {
    userId: string;
    workspaceId: string;
    source: AsyncIterable<Buffer | Uint8Array | string>;
    maxBytes: number;
    headBytes: number;
    sniff: (head: Buffer) => T | null;
  }): Promise<{ blob: PublicBlob; sniffed: T }> {
    const metered = await meterStream(input.source, { headBytes: input.headBytes, maxBytes: input.maxBytes });
    if (!metered.head.length) {
      throw new HttpError('Empty blob', 400, 'EMPTY_BLOB');
    }
    const sniffed = input.sniff(metered.head);
    if (!sniffed) {
      metered.stream.destroy();
      throw new HttpError(
        'Only image (PNG, JPEG, GIF, WebP, HEIC, AVIF), video (MP4, MOV, WebM, MKV) or audio (MP3, WAV, M4A, OGG, FLAC, AAC) files can be uploaded',
        415,
        'UNSUPPORTED_MEDIA_TYPE'
      );
    }
    const blobId = crypto.randomUUID();
    const storageKey = blobObjectKey({
      userId: input.userId,
      workspaceId: input.workspaceId,
      mime: sniffed.mime,
      blobId,
    });
    try {
      await this.store.putStream(storageKey, metered.stream, sniffed.mime);
    } catch (error) {
      await this.store.remove(storageKey);
      throw error;
    }
    const { byteSize, contentHash } = metered.result();
    const [row] = await this.database
      .insert(blobs)
      .values({ id: blobId, workspaceId: input.workspaceId, contentHash, mime: sniffed.mime, byteSize, storageKey })
      .returning({ id: blobs.id, workspaceId: blobs.workspaceId, mime: blobs.mime, byteSize: blobs.byteSize });
    return { blob: row, sniffed };
  }

  /** Stores bytes the server made (thumbnails, previews). The caller has checked access. */
  async storeDerived(userId: string, workspaceId: string, body: Buffer, mime: string): Promise<PublicBlob> {
    const contentHash = crypto.createHash('sha256').update(body).digest('hex');
    return this.write({ userId, workspaceId, body, contentHash, mime });
  }

  /** Metadata and storage key, after the same access checks as get(), without reading the bytes. */
  async info(userId: string, blobId: string): Promise<BlobStreamInfo> {
    const found = await this.lookupMeta(blobId);
    await this.auth.requireMember(userId, found.meta.workspaceId);
    const access = await this.noteAccess(userId, blobId);
    if (access.linked && !access.visible) {
      throw new HttpError('Blob not found', 404, 'BLOB_NOT_FOUND');
    }
    return found;
  }

  /** Metadata with no access check, for signed links and server jobs. Refuses note images. */
  async infoUnchecked(blobId: string): Promise<BlobStreamInfo> {
    const found = await this.lookupMeta(blobId);
    if ((await this.noteAccess(null, blobId)).linked) {
      throw new HttpError('Blob not found', 404, 'BLOB_NOT_FOUND');
    }
    return found;
  }

  /** The stored bytes, or an inclusive range of them, as a stream. */
  async openStream(info: BlobStreamInfo, range?: ByteRange): Promise<Readable> {
    try {
      return await this.store.getStream(info.storageKey, range);
    } catch {
      throw new HttpError('Blob not found', 404, 'BLOB_NOT_FOUND');
    }
  }

  /** The stored bytes in full. For small derived files and server jobs. */
  async readUnchecked(blobId: string): Promise<{ meta: PublicBlob; body: Buffer }> {
    return this.lookup(blobId);
  }

  /** Deletes blobs whose owner (an asset) is already gone. The caller has checked access. */
  async removeUnchecked(blobIds: string[]): Promise<void> {
    for (const blobId of new Set(blobIds.filter(Boolean))) {
      const [row] = await this.database
        .select({ storageKey: blobs.storageKey })
        .from(blobs)
        .where(eq(blobs.id, blobId))
        .limit(1);
      if (!row) continue;
      try {
        await this.database.delete(blobs).where(eq(blobs.id, blobId));
      } catch {
        continue; // still referenced elsewhere (e.g. another asset); keep it
      }
      await this.store.remove(row.storageKey);
    }
  }

  async list(userId: string, workspaceId: string): Promise<string[]> {
    await this.auth.requireMember(userId, workspaceId);
    const rows = await this.database
      .select({ id: blobs.id })
      .from(blobs)
      .where(eq(blobs.workspaceId, workspaceId));
    return rows.map((row) => row.id);
  }

  async remove(userId: string, blobId: string): Promise<void> {
    const [row] = await this.database
      .select({
        workspaceId: blobs.workspaceId,
        storageKey: blobs.storageKey,
      })
      .from(blobs)
      .where(eq(blobs.id, blobId))
      .limit(1);
    if (!row) {
      throw new HttpError('Blob not found', 404, 'BLOB_NOT_FOUND');
    }
    const access = await this.noteAccess(userId, blobId);
    if (access.linked) {
      // A note image belongs to its note's author, not to the workspace's editors.
      if (!access.authored) throw new HttpError('Blob not found', 404, 'BLOB_NOT_FOUND');
      await this.auth.requireMember(userId, row.workspaceId);
    } else {
      await this.auth.requireEditor(userId, row.workspaceId);
    }
    try {
      await this.database.delete(blobs).where(eq(blobs.id, blobId));
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error.code === '23503' || error.code === '23001')) {
        throw new HttpError('This file belongs to a media asset; delete the asset instead', 409, 'BLOB_IN_USE');
      }
      throw error;
    }
    await this.store.remove(row.storageKey);
  }

  private assertSize(body: Buffer): void {
    if (!body.length) {
      throw new HttpError('Empty blob', 400, 'EMPTY_BLOB');
    }
    if (body.length > MAX_BLOB_BYTES) {
      throw new HttpError('Blob too large', 413, 'BLOB_TOO_LARGE');
    }
  }

  /** Puts the bytes in the store and records the blob (and its note, when given). */
  private async write(input: {
    userId: string;
    workspaceId: string;
    body: Buffer;
    contentHash: string;
    mime: string;
    id?: string;
    noteId?: string;
  }): Promise<PublicBlob> {
    const blobId = input.id?.trim() || crypto.randomUUID();
    if (!isValidBlobId(blobId)) {
      throw new HttpError('Invalid blob id', 400, 'INVALID_BLOB_ID');
    }
    let storageKey: string;
    try {
      storageKey = blobObjectKey({ userId: input.userId, workspaceId: input.workspaceId, mime: input.mime, blobId });
    } catch {
      throw new HttpError('Invalid blob id', 400, 'INVALID_BLOB_ID');
    }
    await this.store.put(storageKey, input.body, input.mime);

    return this.database.transaction(async (tx) => {
      const [row] = await tx
        .insert(blobs)
        .values({
          id: blobId,
          workspaceId: input.workspaceId,
          contentHash: input.contentHash,
          mime: input.mime,
          byteSize: input.body.length,
          storageKey,
        })
        .returning({
          id: blobs.id,
          workspaceId: blobs.workspaceId,
          mime: blobs.mime,
          byteSize: blobs.byteSize,
        });
      if (input.noteId) {
        await tx.insert(noteBlobs).values({ noteId: input.noteId, blobId });
      }
      return row;
    });
  }

  /**
   * Whether the blob is attached to any note, and whether `userId` can see one
   * of those notes (author, or a live note shared with the workspace) or wrote one.
   */
  private async noteAccess(
    userId: string | null,
    blobId: string
  ): Promise<{ linked: boolean; visible: boolean; authored: boolean }> {
    const rows = await this.database
      .select({ authorId: notes.authorId, visibility: notes.visibility, deletedAt: notes.deletedAt })
      .from(noteBlobs)
      .innerJoin(notes, eq(notes.id, noteBlobs.noteId))
      .where(eq(noteBlobs.blobId, blobId));
    const authored = userId !== null && rows.some((row) => row.authorId === userId);
    return {
      linked: rows.length > 0,
      visible: authored || rows.some((row) => row.visibility === 'workspace' && row.deletedAt === null),
      authored,
    };
  }

  private async lookupMeta(blobId: string): Promise<BlobStreamInfo> {
    const [row] = await this.database
      .select({
        id: blobs.id,
        workspaceId: blobs.workspaceId,
        mime: blobs.mime,
        byteSize: blobs.byteSize,
        storageKey: blobs.storageKey,
      })
      .from(blobs)
      .where(eq(blobs.id, blobId))
      .limit(1);
    if (!row) {
      throw new HttpError('Blob not found', 404, 'BLOB_NOT_FOUND');
    }
    const { storageKey, ...meta } = row;
    return { meta, storageKey };
  }

  private async lookup(blobId: string): Promise<{ meta: PublicBlob; body: Buffer }> {
    const { meta, storageKey } = await this.lookupMeta(blobId);
    let body: Buffer;
    try {
      body = await this.store.get(storageKey);
    } catch {
      throw new HttpError('Blob not found', 404, 'BLOB_NOT_FOUND');
    }
    return { meta, body };
  }
}
