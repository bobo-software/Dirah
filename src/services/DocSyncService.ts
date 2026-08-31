import { and, desc, eq, gt, notInArray } from 'drizzle-orm';
import { docRevisions, docSnapshots, docUpdates, pages, workspaces } from '../db/schemas';
import { isEncryptedEnvelope } from '../crypto/docEnvelope';
import { canEdit } from '../authz/roles';
import { HttpError } from '../utils/HttpError';
import { type AuthService, type Database } from './AuthService';
import { type PageService, type PublicPage } from './PageService';
import { type ShareService } from './ShareService';
import { extractPlainText } from '../search/extractPlainText';

export interface DocUpdateRow {
  id: number;
  update: Buffer;
}

export interface DocCatchup {
  clock: number;
  snapshot: Buffer | null;
  updates: DocUpdateRow[];
}

export interface DocRevisionInfo {
  id: number;
  updateClock: number;
  createdAt: Date;
  preview: string;
}

const MAX_REVISIONS = 50;
const LIST_PREVIEW_CHARS = 280;
const FULL_PREVIEW_CHARS = 8_000;

export class DocSyncService {
  constructor(
    private readonly database: Database,
    private readonly pages: PageService,
    private readonly snapshotEvery: number,
    private readonly auth: AuthService,
    private readonly shares: ShareService
  ) {}

  async requireView(
    userId: string,
    docId: string,
    workspaceId?: string
  ): Promise<{ page: PublicPage; canPush: boolean }> {
    const page = await this.pages.requireMemberPage(userId, docId);
    await this.pages.requireBlockPage(page);
    if (workspaceId && page.workspaceId !== workspaceId) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN');
    }
    const membership = await this.auth.requireMember(userId, page.workspaceId);
    return { page, canPush: canEdit(membership.role) };
  }

  async requireShareView(
    token: string,
    docId: string,
    workspaceId?: string
  ): Promise<PublicPage> {
    const page = await this.shares.requireActive(token, docId);
    if (workspaceId && page.workspaceId !== workspaceId) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN');
    }
    return page;
  }

  async catchup(userId: string, docId: string, clock: number): Promise<DocCatchup> {
    const page = await this.pages.requireMemberPage(userId, docId);
    await this.pages.requireBlockPage(page);
    return this.catchupAuthorized(docId, clock);
  }

  async catchupShare(token: string, docId: string, clock: number): Promise<DocCatchup> {
    const page = await this.shares.requireActive(token, docId);
    return this.catchupAuthorized(page.id, clock);
  }

  async push(userId: string, docId: string, update: Buffer): Promise<DocUpdateRow> {
    const page = await this.pages.requireEditorPage(userId, docId);
    await this.pages.requireBlockPage(page);
    if (!update.length) {
      throw new HttpError('Empty update', 400, 'EMPTY_UPDATE');
    }
    if (update.length > 2 * 1024 * 1024) {
      throw new HttpError('Update too large', 413, 'UPDATE_TOO_LARGE');
    }
    const [row] = await this.database
      .insert(docUpdates)
      .values({
        workspaceId: page.workspaceId,
        docId,
        update,
      })
      .returning({ id: docUpdates.id, update: docUpdates.update });
    try {
      await this.maybeSnapshot(docId);
    } catch (error) {
      console.error('doc snapshot failed', error);
    }
    try {
      await this.indexSearch(docId);
    } catch (error) {
      console.error('doc search index failed', error);
    }
    return row;
  }

  private async isEncryptedDoc(docId: string): Promise<boolean> {
    const [row] = await this.database
      .select({ encrypted: workspaces.encrypted })
      .from(pages)
      .innerJoin(workspaces, eq(pages.workspaceId, workspaces.id))
      .where(eq(pages.id, docId))
      .limit(1);
    return Boolean(row?.encrypted);
  }

  private async catchupAuthorized(docId: string, clock: number): Promise<DocCatchup> {
    const [snap] = await this.database
      .select({
        snapshot: docSnapshots.snapshot,
        updateClock: docSnapshots.updateClock,
      })
      .from(docSnapshots)
      .where(eq(docSnapshots.docId, docId))
      .limit(1);

    const after = snap && clock < snap.updateClock ? snap.updateClock : clock;
    const snapshot = snap && clock < snap.updateClock ? snap.snapshot : null;

    const updates = await this.database
      .select({ id: docUpdates.id, update: docUpdates.update })
      .from(docUpdates)
      .where(and(eq(docUpdates.docId, docId), gt(docUpdates.id, after)))
      .orderBy(docUpdates.id);

    const last = updates.at(-1)?.id ?? after;
    return { clock: last, snapshot, updates };
  }

  private async maybeSnapshot(docId: string): Promise<void> {
    const [snap] = await this.database
      .select({ updateClock: docSnapshots.updateClock, snapshot: docSnapshots.snapshot })
      .from(docSnapshots)
      .where(eq(docSnapshots.docId, docId))
      .limit(1);
    const clock = snap?.updateClock ?? 0;
    const pending = await this.database
      .select({ id: docUpdates.id, update: docUpdates.update })
      .from(docUpdates)
      .where(and(eq(docUpdates.docId, docId), gt(docUpdates.id, clock)))
      .orderBy(docUpdates.id);
    if (pending.length < this.snapshotEvery) {
      return;
    }
    if (await this.isEncryptedDoc(docId)) {
      return;
    }
    if (pending.some((row) => isEncryptedEnvelope(new Uint8Array(row.update)))) {
      return;
    }
    const merged = await mergeYjs(snap?.snapshot ?? null, pending.map((row) => row.update));
    const lastId = pending[pending.length - 1]!.id;
    await this.database
      .insert(docSnapshots)
      .values({
        docId,
        snapshot: merged,
        updateClock: lastId,
      })
      .onConflictDoUpdate({
        target: docSnapshots.docId,
        set: {
          snapshot: merged,
          updateClock: lastId,
          createdAt: new Date(),
        },
      });
    try {
      await this.recordRevision(docId, merged, lastId);
    } catch (error) {
      console.error('doc revision failed', error);
    }
  }

  async listRevisions(userId: string, docId: string): Promise<DocRevisionInfo[]> {
    const page = await this.pages.requireMemberPage(userId, docId);
    await this.pages.requireBlockPage(page);
    const rows = await this.database
      .select({
        id: docRevisions.id,
        updateClock: docRevisions.updateClock,
        createdAt: docRevisions.createdAt,
        snapshot: docRevisions.snapshot,
      })
      .from(docRevisions)
      .where(eq(docRevisions.docId, docId))
      .orderBy(desc(docRevisions.createdAt), desc(docRevisions.id))
      .limit(MAX_REVISIONS);
    const listed: DocRevisionInfo[] = [];
    for (const row of rows) {
      listed.push({
        id: row.id,
        updateClock: row.updateClock,
        createdAt: row.createdAt,
        preview: isEncryptedEnvelope(new Uint8Array(row.snapshot))
          ? ''
          : await previewFromSnapshot(row.snapshot, LIST_PREVIEW_CHARS),
      });
    }
    return listed;
  }

  async getRevision(
    userId: string,
    docId: string,
    revisionId: number
  ): Promise<DocRevisionInfo> {
    const page = await this.pages.requireMemberPage(userId, docId);
    await this.pages.requireBlockPage(page);
    const row = await this.findRevision(docId, revisionId);
    return {
      id: row.id,
      updateClock: row.updateClock,
      createdAt: row.createdAt,
      preview: isEncryptedEnvelope(new Uint8Array(row.snapshot))
        ? ''
        : await previewFromSnapshot(row.snapshot, FULL_PREVIEW_CHARS),
    };
  }

  async saveRevision(userId: string, docId: string): Promise<DocRevisionInfo> {
    const page = await this.pages.requireEditorPage(userId, docId);
    await this.pages.requireBlockPage(page);
    if (await this.isEncryptedDoc(docId)) {
      throw new HttpError(
        'History save is unavailable while end-to-end encryption is on',
        409,
        'E2E_NO_SERVER_HISTORY'
      );
    }
    const catchup = await this.catchupAuthorized(docId, 0);
    if (!catchup.snapshot && catchup.updates.length === 0) {
      throw new HttpError('Nothing to save yet', 400, 'EMPTY_REVISION');
    }
    const merged = await mergeYjs(
      catchup.snapshot,
      catchup.updates.map((row) => row.update)
    );
    const clock = catchup.clock;
    const row = await this.recordRevision(docId, merged, clock);
    return {
      id: row.id,
      updateClock: row.updateClock,
      createdAt: row.createdAt,
      preview: await previewFromSnapshot(merged, LIST_PREVIEW_CHARS),
    };
  }

  async restoreRevision(userId: string, docId: string, revisionId: number): Promise<void> {
    const page = await this.pages.requireEditorPage(userId, docId);
    await this.pages.requireBlockPage(page);
    const row = await this.findRevision(docId, revisionId);
    await this.database.delete(docUpdates).where(eq(docUpdates.docId, docId));
    await this.database
      .insert(docSnapshots)
      .values({
        docId,
        snapshot: row.snapshot,
        updateClock: 1,
      })
      .onConflictDoUpdate({
        target: docSnapshots.docId,
        set: {
          snapshot: row.snapshot,
          updateClock: 1,
          createdAt: new Date(),
        },
      });
    try {
      await this.indexSearch(docId);
    } catch (error) {
      console.error('doc search index failed', error);
    }
  }

  private async findRevision(docId: string, revisionId: number) {
    const [row] = await this.database
      .select({
        id: docRevisions.id,
        updateClock: docRevisions.updateClock,
        createdAt: docRevisions.createdAt,
        snapshot: docRevisions.snapshot,
      })
      .from(docRevisions)
      .where(and(eq(docRevisions.docId, docId), eq(docRevisions.id, revisionId)))
      .limit(1);
    if (!row) {
      throw new HttpError('Version not found', 404, 'REVISION_NOT_FOUND');
    }
    return row;
  }

  private async recordRevision(
    docId: string,
    snapshot: Buffer,
    updateClock: number
  ): Promise<{ id: number; updateClock: number; createdAt: Date }> {
    const [row] = await this.database
      .insert(docRevisions)
      .values({ docId, snapshot, updateClock })
      .returning({
        id: docRevisions.id,
        updateClock: docRevisions.updateClock,
        createdAt: docRevisions.createdAt,
      });
    if (!row) {
      throw new HttpError('Could not save version', 500, 'REVISION_FAILED');
    }
    const kept = await this.database
      .select({ id: docRevisions.id })
      .from(docRevisions)
      .where(eq(docRevisions.docId, docId))
      .orderBy(desc(docRevisions.createdAt), desc(docRevisions.id))
      .limit(MAX_REVISIONS);
    if (kept.length === MAX_REVISIONS) {
      await this.database
        .delete(docRevisions)
        .where(
          and(
            eq(docRevisions.docId, docId),
            notInArray(
              docRevisions.id,
              kept.map((item) => item.id)
            )
          )
        );
    }
    return row;
  }

  private async indexSearch(docId: string): Promise<void> {
    if (await this.isEncryptedDoc(docId)) {
      return;
    }
    const catchup = await this.catchupAuthorized(docId, 0);
    if (!catchup.snapshot && catchup.updates.length === 0) {
      await this.pages.setSearchText(docId, '');
      return;
    }
    const merged = await mergeYjs(
      catchup.snapshot,
      catchup.updates.map((row) => row.update)
    );
    const Y = await import('yjs');
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(merged));
    await this.pages.setSearchText(docId, extractPlainText(Y, doc));
  }
}

async function mergeYjs(snapshot: Buffer | null, updates: Buffer[]): Promise<Buffer> {
  const Y = await import('yjs');
  const doc = new Y.Doc();
  if (snapshot) {
    Y.applyUpdate(doc, new Uint8Array(snapshot));
  }
  for (const update of updates) {
    Y.applyUpdate(doc, new Uint8Array(update));
  }
  return Buffer.from(Y.encodeStateAsUpdate(doc));
}

async function previewFromSnapshot(snapshot: Buffer, maxChars: number): Promise<string> {
  const Y = await import('yjs');
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(snapshot));
  return extractPlainText(Y, doc).slice(0, maxChars);
}
