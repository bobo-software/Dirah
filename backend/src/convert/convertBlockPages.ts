import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { markdownBodies, pages, workspaces } from '../db/schemas';
import { hashMarkdown, markdownSearchText, slugify } from '../utils/slugify';
import type { Database } from '../services/AuthService';
import { ENCRYPTED_PAGE_NOTICE, planParentIds, yDocToMarkdown } from './yDocToMarkdown';

const ENVELOPE_MAGIC = new Uint8Array([0x44, 0x52, 0x31, 0x01]);

function isEncryptedEnvelope(bytes: Uint8Array): boolean {
  if (bytes.length < ENVELOPE_MAGIC.length + 12 + 16) return false;
  return ENVELOPE_MAGIC.every((value, i) => bytes[i] === value);
}

type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

type PageRow = {
  id: string;
  workspaceId: string;
  title: string;
  parentId: string | null;
  position: number;
  kind: string;
  slug: string | null;
  deletedAt: Date | null;
};

export interface ConvertBlockPagesResult {
  converted: number;
  folders: number;
  encryptedNotices: number;
  droppedYjs: boolean;
}

async function tableExists(queryable: Queryable, name: string): Promise<boolean> {
  const result = await queryable.query(
    `SELECT COUNT(*)::int AS cnt
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return Number(result.rows[0]?.cnt ?? 0) > 0;
}

async function mergeYjs(snapshot: Buffer | null, updates: Buffer[]): Promise<Buffer | null> {
  if (!snapshot && updates.length === 0) return null;
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

async function loadYjsBody(
  queryable: Queryable,
  pageId: string
): Promise<{ merged: Buffer | null; encrypted: boolean }> {
  const snap = await queryable.query(
    `SELECT snapshot FROM doc_snapshots WHERE doc_id = $1 LIMIT 1`,
    [pageId]
  );
  const snapshot = snap.rows[0]?.snapshot
    ? Buffer.isBuffer(snap.rows[0].snapshot)
      ? (snap.rows[0].snapshot as Buffer)
      : Buffer.from(snap.rows[0].snapshot as Uint8Array)
    : null;
  const clock = snapshot
    ? Number(
        (
          await queryable.query(`SELECT update_clock FROM doc_snapshots WHERE doc_id = $1 LIMIT 1`, [
            pageId,
          ])
        ).rows[0]?.update_clock ?? 0
      )
    : 0;
  const updates = await queryable.query(
    `SELECT id, update FROM doc_updates WHERE doc_id = $1 AND id > $2 ORDER BY id`,
    [pageId, clock]
  );
  const buffers: Buffer[] = [];
  let encrypted = Boolean(snapshot && isEncryptedEnvelope(new Uint8Array(snapshot)));
  for (const row of updates.rows) {
    const buf = Buffer.isBuffer(row.update) ? row.update : Buffer.from(row.update as Uint8Array);
    buffers.push(buf);
    if (isEncryptedEnvelope(new Uint8Array(buf))) encrypted = true;
  }
  if (encrypted) {
    return { merged: null, encrypted: true };
  }
  return { merged: await mergeYjs(snapshot, buffers), encrypted: false };
}

async function allocateSlug(
  database: Database,
  workspaceId: string,
  parentId: string | null,
  desiredRaw: string,
  excludeId?: string
): Promise<string> {
  const base = slugify(desiredRaw);
  const siblings = await database
    .select({ id: pages.id, slug: pages.slug })
    .from(pages)
    .where(
      and(
        eq(pages.workspaceId, workspaceId),
        parentId ? eq(pages.parentId, parentId) : isNull(pages.parentId),
        isNull(pages.deletedAt)
      )
    );
  const taken = new Set(
    siblings.filter((row) => row.id !== excludeId && row.slug).map((row) => row.slug as string)
  );
  if (!taken.has(base)) return base;
  for (let i = 2; i < 500; i += 1) {
    const candidate = `${base.slice(0, Math.max(1, 80 - String(i).length - 1))}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

async function writeMarkdownBody(database: Database, pageId: string, content: string): Promise<void> {
  const hash = hashMarkdown(content);
  const now = new Date();
  await database
    .insert(markdownBodies)
    .values({ pageId, content, contentHash: hash, updatedAt: now })
    .onConflictDoUpdate({
      target: markdownBodies.pageId,
      set: { content, contentHash: hash, updatedAt: now },
    });
  await database
    .update(pages)
    .set({ searchText: markdownSearchText(content).slice(0, 200_000), updatedAt: now })
    .where(eq(pages.id, pageId));
}

export async function dropYjsSchema(queryable: Queryable): Promise<boolean> {
  const hasUpdates = await tableExists(queryable, 'doc_updates');
  if (!hasUpdates && !(await tableExists(queryable, 'doc_snapshots'))) {
    await queryable.query(`ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_kind_check`);
    await queryable.query(
      `ALTER TABLE pages ADD CONSTRAINT pages_kind_check CHECK (kind IN ('folder', 'markdown'))`
    );
    return false;
  }
  await queryable.query(`DROP TABLE IF EXISTS doc_revisions`);
  await queryable.query(`DROP TABLE IF EXISTS doc_updates`);
  await queryable.query(`DROP TABLE IF EXISTS doc_snapshots`);
  await queryable.query(`ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_kind_check`);
  await queryable.query(
    `ALTER TABLE pages ADD CONSTRAINT pages_kind_check CHECK (kind IN ('folder', 'markdown'))`
  );
  return true;
}

export async function convertBlockPages(
  database: Database,
  queryable: Queryable
): Promise<ConvertBlockPagesResult> {
  const result: ConvertBlockPagesResult = {
    converted: 0,
    folders: 0,
    encryptedNotices: 0,
    droppedYjs: false,
  };

  const blockPages = (await database
    .select({
      id: pages.id,
      workspaceId: pages.workspaceId,
      title: pages.title,
      parentId: pages.parentId,
      position: pages.position,
      kind: pages.kind,
      slug: pages.slug,
      deletedAt: pages.deletedAt,
    })
    .from(pages)
    .where(eq(pages.kind, 'page'))) as PageRow[];

  const hasYjs = await tableExists(queryable, 'doc_snapshots');
  const parentIds = planParentIds(blockPages);
  const encryptedWorkspaces = new Set(
    (
      await database
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.encrypted, true))
    ).map((row) => row.id)
  );

  for (const page of blockPages) {
    let content = '';
    let encryptedNotice = encryptedWorkspaces.has(page.workspaceId);
    if (hasYjs && !encryptedNotice) {
      const loaded = await loadYjsBody(queryable, page.id);
      encryptedNotice = loaded.encrypted;
      if (loaded.merged && !encryptedNotice) {
        const Y = await import('yjs');
        const doc = new Y.Doc();
        Y.applyUpdate(doc, new Uint8Array(loaded.merged));
        content = yDocToMarkdown(doc, {
          fallbackTitle: page.title,
          workspaceId: page.workspaceId,
        });
      }
    }
    if (encryptedNotice) {
      content = ENCRYPTED_PAGE_NOTICE;
      result.encryptedNotices += 1;
    }

    if (parentIds.has(page.id)) {
      const slug =
        page.slug ||
        (page.deletedAt
          ? slugify(page.title)
          : await allocateSlug(database, page.workspaceId, page.parentId, page.title, page.id));
      await database
        .update(pages)
        .set({ kind: 'folder', slug, updatedAt: new Date() })
        .where(eq(pages.id, page.id));
      const indexId = randomUUID();
      const indexSlug = page.deletedAt
        ? 'index'
        : await allocateSlug(database, page.workspaceId, page.id, 'index');
      await database.insert(pages).values({
        id: indexId,
        workspaceId: page.workspaceId,
        title: page.title || 'Index',
        parentId: page.id,
        position: -1,
        kind: 'markdown',
        slug: indexSlug,
        deletedAt: page.deletedAt,
        status: '',
      });
      await writeMarkdownBody(database, indexId, content);
      result.folders += 1;
    } else {
      const slug =
        page.slug ||
        (page.deletedAt
          ? slugify(page.title)
          : await allocateSlug(database, page.workspaceId, page.parentId, page.title, page.id));
      await database
        .update(pages)
        .set({ kind: 'markdown', slug, updatedAt: new Date() })
        .where(eq(pages.id, page.id));
      await writeMarkdownBody(database, page.id, content);
    }
    result.converted += 1;
  }

  const leftover = await database.select({ id: pages.id }).from(pages).where(eq(pages.kind, 'page'));
  if (leftover.length === 0) {
    result.droppedYjs = await dropYjsSchema(queryable);
  }

  return result;
}

export async function convertBlockPagesIfNeeded(
  database: Database,
  queryable: Queryable
): Promise<ConvertBlockPagesResult | null> {
  const leftover = await database.select({ id: pages.id }).from(pages).where(eq(pages.kind, 'page')).limit(1);
  const hasYjs = await tableExists(queryable, 'doc_updates');
  if (leftover.length === 0 && !hasYjs) {
    const check = await queryable.query(
      `SELECT pg_get_constraintdef(oid) AS def
       FROM pg_constraint
       WHERE conrelid = 'pages'::regclass AND conname = 'pages_kind_check'`
    );
    const def = String(check.rows[0]?.def ?? '');
    if (def.includes('page')) {
      await dropYjsSchema(queryable);
    }
    return null;
  }
  return convertBlockPages(database, queryable);
}
