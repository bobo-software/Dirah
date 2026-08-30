import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { blobs } from '../db/schemas';
import { HttpError } from '../utils/HttpError';
import { type AuthService, type Database } from './AuthService';
import type { BlobStore } from '../blobs/blobStore';

export interface PublicBlob {
  id: string;
  workspaceId: string;
  mime: string;
  byteSize: number;
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
    if (!body.length) {
      throw new HttpError('Empty blob', 400, 'EMPTY_BLOB');
    }
    if (body.length > 12 * 1024 * 1024) {
      throw new HttpError('Blob too large', 413, 'BLOB_TOO_LARGE');
    }
    const contentHash = crypto.createHash('sha256').update(body).digest('hex');
    const [existing] = await this.database
      .select({
        id: blobs.id,
        workspaceId: blobs.workspaceId,
        mime: blobs.mime,
        byteSize: blobs.byteSize,
      })
      .from(blobs)
      .where(and(eq(blobs.workspaceId, workspaceId), eq(blobs.contentHash, contentHash)))
      .limit(1);
    if (existing) {
      return existing;
    }

    const blobId = id?.trim() || crypto.randomUUID();
    if (!/^[A-Za-z0-9._~+=-]{1,128}$/.test(blobId)) {
      throw new HttpError('Invalid blob id', 400, 'INVALID_BLOB_ID');
    }
    const storageKey = `${workspaceId}/${blobId}`;
    await this.store.put(storageKey, body, mime || 'application/octet-stream');

    const [row] = await this.database
      .insert(blobs)
      .values({
        id: blobId,
        workspaceId,
        contentHash,
        mime: mime || 'application/octet-stream',
        byteSize: body.length,
        storageKey,
      })
      .returning({
        id: blobs.id,
        workspaceId: blobs.workspaceId,
        mime: blobs.mime,
        byteSize: blobs.byteSize,
      });
    return row;
  }

  async get(userId: string, blobId: string): Promise<{ meta: PublicBlob; body: Buffer }> {
    const found = await this.lookup(blobId);
    await this.auth.requireMember(userId, found.meta.workspaceId);
    return found;
  }

  async getInWorkspace(
    workspaceId: string,
    blobId: string
  ): Promise<{ meta: PublicBlob; body: Buffer }> {
    const found = await this.lookup(blobId);
    if (found.meta.workspaceId !== workspaceId) {
      throw new HttpError('Blob not found', 404, 'BLOB_NOT_FOUND');
    }
    return found;
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
    await this.auth.requireEditor(userId, row.workspaceId);
    await this.database.delete(blobs).where(eq(blobs.id, blobId));
    await this.store.remove(row.storageKey);
  }

  private async lookup(blobId: string): Promise<{ meta: PublicBlob; body: Buffer }> {
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
    let body: Buffer;
    try {
      body = await this.store.get(row.storageKey);
    } catch {
      throw new HttpError('Blob not found', 404, 'BLOB_NOT_FOUND');
    }
    return {
      meta: {
        id: row.id,
        workspaceId: row.workspaceId,
        mime: row.mime,
        byteSize: row.byteSize,
      },
      body,
    };
  }
}
