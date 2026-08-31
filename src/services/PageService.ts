import { and, asc, eq, ilike, inArray, isNotNull, isNull, max, or, sql } from 'drizzle-orm';
import { markdownBodies, pageFavorites, pages, workspaces } from '../db/schemas';
import { HttpError } from '../utils/HttpError';
import { hashMarkdown, markdownSearchText, slugify } from '../utils/slugify';
import { type AuthService, type Database } from './AuthService';

export const PAGE_STATUSES = ['', 'todo', 'doing', 'done'] as const;
export type PageStatus = (typeof PAGE_STATUSES)[number];

export const PAGE_KINDS = ['folder', 'markdown'] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export const MAX_MARKDOWN_BYTES = 1_000_000;
export const EMPTY_MARKDOWN_HASH = hashMarkdown('');

export interface PublicPage {
  id: string;
  workspaceId: string;
  title: string;
  parentId: string | null;
  position: number;
  deletedAt: Date | null;
  status: PageStatus;
  kind: PageKind;
  slug: string | null;
  favorited: boolean;
}

export interface MarkdownBody {
  page: PublicPage;
  content: string;
  hash: string;
  updatedAt: Date;
}

export interface ListPagesQuery {
  trashed?: boolean;
  q?: string;
}

export interface MarkdownSearchHit {
  page: PublicPage;
  snippet: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const pageColumns = {
  id: pages.id,
  workspaceId: pages.workspaceId,
  title: pages.title,
  parentId: pages.parentId,
  position: pages.position,
  deletedAt: pages.deletedAt,
  status: pages.status,
  kind: pages.kind,
  slug: pages.slug,
};

type PageRow = {
  id: string;
  workspaceId: string;
  title: string;
  parentId: string | null;
  position: number;
  deletedAt: Date | null;
  status: string;
  kind: string;
  slug: string | null;
};

function asKind(value: string): PageKind {
  return PAGE_KINDS.includes(value as PageKind) ? (value as PageKind) : 'markdown';
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export class PageService {
  constructor(
    private readonly database: Database,
    private readonly auth: AuthService
  ) {}

  async isWorkspaceEncrypted(workspaceId: string): Promise<boolean> {
    const [row] = await this.database
      .select({ encrypted: workspaces.encrypted })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    return Boolean(row?.encrypted);
  }

  async list(userId: string, workspaceId: string, query: ListPagesQuery = {}): Promise<PublicPage[]> {
    await this.auth.requireMember(userId, workspaceId);
    const filters = [eq(pages.workspaceId, workspaceId)];
    if (query.trashed) {
      filters.push(isNotNull(pages.deletedAt));
    } else {
      filters.push(isNull(pages.deletedAt));
    }
    const q = query.q?.trim();
    if (q) {
      const safe = q.replace(/[%_]/g, '').slice(0, 100);
      if (safe) {
        const titleMatch = ilike(pages.title, `%${safe}%`);
        const bodyMatch = sql`pages.search_tsv @@ plainto_tsquery('english', ${safe})`;
        filters.push(or(titleMatch, bodyMatch)!);
      }
    }

    const rows = await this.database
      .select({
        ...pageColumns,
        favoriteUserId: pageFavorites.userId,
      })
      .from(pages)
      .leftJoin(
        pageFavorites,
        and(eq(pageFavorites.pageId, pages.id), eq(pageFavorites.userId, userId))
      )
      .where(and(...filters))
      .orderBy(asc(pages.position), asc(pages.createdAt));

    return rows.map((row) => this.toPublic(row, row.favoriteUserId != null));
  }

  async searchMarkdown(
    userId: string,
    workspaceId: string,
    q: string,
    limit = 20
  ): Promise<MarkdownSearchHit[]> {
    await this.auth.requireMember(userId, workspaceId);
    const safe = q.replace(/[%_]/g, '').slice(0, 100).trim();
    if (!safe) return [];
    const cap = Math.min(50, Math.max(1, limit));
    const titleMatch = ilike(pages.title, `%${safe}%`);
    const bodyMatch = sql`pages.search_tsv @@ plainto_tsquery('english', ${safe})`;
    const snippetExpr = sql<string>`ts_headline(
      'english',
      coalesce(${pages.searchText}, ''),
      plainto_tsquery('english', ${safe}),
      'MaxFragments=2,MaxWords=24,MinWords=5'
    )`;
    const rows = await this.database
      .select({
        ...pageColumns,
        snippet: snippetExpr,
        searchText: pages.searchText,
      })
      .from(pages)
      .where(
        and(
          eq(pages.workspaceId, workspaceId),
          isNull(pages.deletedAt),
          eq(pages.kind, 'markdown'),
          or(titleMatch, bodyMatch)!
        )
      )
      .limit(cap);
    return rows.map((row) => ({
      page: this.toPublic(row, false),
      snippet: (row.snippet && row.snippet.trim()) || row.searchText.slice(0, 160) || row.title,
    }));
  }

  async create(
    userId: string,
    workspaceId: string,
    input: {
      id?: string;
      title?: string;
      parentId?: string | null;
      kind?: PageKind | 'page';
      slug?: string;
    }
  ): Promise<PublicPage> {
    await this.auth.requireEditor(userId, workspaceId);
    const title = (input.title ?? 'Untitled').trim() || 'Untitled';
    if (input.kind === 'page') {
      throw new HttpError('Invalid page kind', 400, 'INVALID_KIND');
    }
    const kind = input.kind ?? 'markdown';
    if (!PAGE_KINDS.includes(kind)) {
      throw new HttpError('Invalid page kind', 400, 'INVALID_KIND');
    }
    if (input.id && !UUID_RE.test(input.id)) {
      throw new HttpError('Invalid page id', 400, 'INVALID_ID');
    }
    await this.assertParentInWorkspace(workspaceId, input.parentId);
    const position = await this.nextPosition(workspaceId, input.parentId ?? null);

    if (input.id) {
      const existing = await this.findRow(input.id);
      if (existing) {
        if (existing.workspaceId !== workspaceId) {
          throw new HttpError('Forbidden', 403, 'FORBIDDEN');
        }
        return this.patch(userId, input.id, { title, parentId: input.parentId });
      }
    }

    const slug = await this.allocateSlug(workspaceId, input.parentId ?? null, input.slug || title);

    try {
      const page = await this.database.transaction(async (tx) => {
        const [created] = await tx
          .insert(pages)
          .values({
            ...(input.id ? { id: input.id } : {}),
            workspaceId,
            title,
            parentId: input.parentId ?? null,
            position,
            kind,
            slug,
          })
          .returning(pageColumns);
        if (kind === 'markdown') {
          await tx.insert(markdownBodies).values({
            pageId: created.id,
            content: '',
            contentHash: EMPTY_MARKDOWN_HASH,
          });
        }
        return created;
      });
      return this.toPublic(page, false);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError('A sibling already uses that slug', 409, 'SLUG_TAKEN');
      }
      throw error;
    }
  }

  async patch(
    userId: string,
    pageId: string,
    input: {
      title?: string;
      parentId?: string | null;
      position?: number;
      status?: PageStatus;
      slug?: string;
    }
  ): Promise<PublicPage> {
    const page = await this.requireEditorPage(userId, pageId);
    if (input.parentId !== undefined) {
      await this.assertParentInWorkspace(page.workspaceId, input.parentId);
      await this.assertNoCycle(page.workspaceId, pageId, input.parentId);
    }
    if (input.status !== undefined && !PAGE_STATUSES.includes(input.status)) {
      throw new HttpError('Invalid status', 400, 'INVALID_STATUS');
    }
    const title =
      input.title !== undefined ? input.title.trim() || 'Untitled' : page.title;
    const parentId = input.parentId === undefined ? page.parentId : input.parentId;
    const parentChanged = input.parentId !== undefined && input.parentId !== page.parentId;
    const position =
      input.position ??
      (parentChanged ? await this.nextPosition(page.workspaceId, parentId) : page.position);
    const status = input.status === undefined ? page.status : input.status;
    let slug = page.slug;
    if (input.slug !== undefined || parentChanged) {
      slug = await this.allocateSlug(
        page.workspaceId,
        parentId,
        input.slug || title,
        pageId
      );
    }
    try {
      const [updated] = await this.database
        .update(pages)
        .set({
          title,
          parentId,
          position,
          status,
          slug,
          updatedAt: new Date(),
        })
        .where(eq(pages.id, pageId))
        .returning(pageColumns);
      return this.withFavorite(userId, updated);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError('A sibling already uses that slug', 409, 'SLUG_TAKEN');
      }
      throw error;
    }
  }

  async trash(userId: string, pageId: string): Promise<void> {
    const page = await this.requireEditorPage(userId, pageId);
    const ids = await this.descendantIds(page.workspaceId, pageId, true);
    const now = new Date();
    await this.database
      .update(pages)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(inArray(pages.id, ids), isNull(pages.deletedAt)));
  }

  async restore(userId: string, pageId: string): Promise<PublicPage> {
    const page = await this.requireEditorPage(userId, pageId, { includeTrashed: true });
    if (!page.deletedAt) {
      return page;
    }
    let parentId = page.parentId;
    if (parentId) {
      const parent = await this.findRow(parentId);
      if (!parent || parent.deletedAt) {
        parentId = null;
      }
    }
    const slug = await this.allocateSlug(page.workspaceId, parentId, page.slug || page.title, pageId);
    const [restored] = await this.database
      .update(pages)
      .set({ deletedAt: null, parentId, slug, updatedAt: new Date() })
      .where(eq(pages.id, pageId))
      .returning(pageColumns);
    return this.withFavorite(userId, restored);
  }

  async removePermanent(userId: string, pageId: string): Promise<string[]> {
    const page = await this.requireEditorPage(userId, pageId, { includeTrashed: true });
    if (!page.deletedAt) {
      throw new HttpError('Trash the page before permanently deleting it', 400, 'NOT_TRASHED');
    }
    const ids = await this.descendantIds(page.workspaceId, pageId, true);
    await this.database.delete(pages).where(inArray(pages.id, ids));
    return ids;
  }

  async setFavorite(userId: string, pageId: string, favorite: boolean): Promise<PublicPage> {
    const page = await this.requireMemberPage(userId, pageId);
    if (favorite) {
      await this.database
        .insert(pageFavorites)
        .values({ userId, pageId })
        .onConflictDoNothing();
    } else {
      await this.database
        .delete(pageFavorites)
        .where(and(eq(pageFavorites.userId, userId), eq(pageFavorites.pageId, pageId)));
    }
    return { ...page, favorited: favorite };
  }

  async setSearchText(pageId: string, text: string): Promise<void> {
    await this.database
      .update(pages)
      .set({ searchText: text.slice(0, 200_000) })
      .where(eq(pages.id, pageId));
  }

  async getMarkdown(userId: string, pageId: string): Promise<MarkdownBody> {
    const page = await this.requireMemberPage(userId, pageId);
    if (page.kind !== 'markdown') {
      throw new HttpError('Not a markdown document', 400, 'NOT_MARKDOWN');
    }
    const [row] = await this.database
      .select()
      .from(markdownBodies)
      .where(eq(markdownBodies.pageId, pageId))
      .limit(1);
    if (!row) {
      throw new HttpError('Markdown body not found', 404, 'MARKDOWN_NOT_FOUND');
    }
    return { page, content: row.content, hash: row.contentHash, updatedAt: row.updatedAt };
  }

  async putMarkdown(
    userId: string,
    pageId: string,
    content: string,
    expectedHash?: string
  ): Promise<MarkdownBody> {
    const page = await this.requireEditorPage(userId, pageId);
    if (page.kind !== 'markdown') {
      throw new HttpError('Not a markdown document', 400, 'NOT_MARKDOWN');
    }
    if (Buffer.byteLength(content, 'utf8') > MAX_MARKDOWN_BYTES) {
      throw new HttpError('Markdown is too large', 413, 'MARKDOWN_TOO_LARGE');
    }
    const [current] = await this.database
      .select()
      .from(markdownBodies)
      .where(eq(markdownBodies.pageId, pageId))
      .limit(1);
    if (!current) {
      throw new HttpError('Markdown body not found', 404, 'MARKDOWN_NOT_FOUND');
    }
    if (expectedHash && expectedHash !== current.contentHash) {
      throw new HttpError('Markdown was updated elsewhere', 409, 'HASH_MISMATCH');
    }
    const hash = hashMarkdown(content);
    const now = new Date();
    const [updated] = await this.database
      .update(markdownBodies)
      .set({ content, contentHash: hash, updatedAt: now })
      .where(eq(markdownBodies.pageId, pageId))
      .returning();
    await this.setSearchText(pageId, markdownSearchText(content));
    return { page, content: updated.content, hash: updated.contentHash, updatedAt: updated.updatedAt };
  }

  async requireMemberPage(
    userId: string,
    pageId: string,
    options: { includeTrashed?: boolean } = {}
  ): Promise<PublicPage> {
    const page = await this.getPage(pageId, options);
    await this.auth.requireMember(userId, page.workspaceId);
    return this.withFavorite(userId, page);
  }

  async requireEditorPage(
    userId: string,
    pageId: string,
    options: { includeTrashed?: boolean } = {}
  ): Promise<PublicPage> {
    const page = await this.getPage(pageId, options);
    await this.auth.requireEditor(userId, page.workspaceId);
    return this.withFavorite(userId, page);
  }

  async requireOwnedPage(userId: string, pageId: string): Promise<PublicPage> {
    return this.requireEditorPage(userId, pageId);
  }

  async requireMarkdownPage(page: PublicPage): Promise<void> {
    if (page.kind !== 'markdown') {
      throw new HttpError('Not a markdown document', 400, 'NOT_MARKDOWN');
    }
  }

  async loadMarkdownBody(pageId: string): Promise<{ content: string; hash: string; updatedAt: Date } | null> {
    const [row] = await this.database
      .select()
      .from(markdownBodies)
      .where(eq(markdownBodies.pageId, pageId))
      .limit(1);
    if (!row) return null;
    return { content: row.content, hash: row.contentHash, updatedAt: row.updatedAt };
  }

  async isTrashed(pageId: string): Promise<boolean> {
    const row = await this.findRow(pageId);
    return Boolean(row?.deletedAt);
  }

  private async getPage(
    pageId: string,
    options: { includeTrashed?: boolean } = {}
  ): Promise<PublicPage> {
    const page = await this.findRow(pageId);
    if (!page || (!options.includeTrashed && page.deletedAt)) {
      throw new HttpError('Page not found', 404, 'PAGE_NOT_FOUND');
    }
    return this.toPublic(page, false);
  }

  private async findRow(pageId: string) {
    const [page] = await this.database
      .select(pageColumns)
      .from(pages)
      .where(eq(pages.id, pageId))
      .limit(1);
    return page ?? null;
  }

  private async withFavorite(userId: string, page: PageRow | PublicPage): Promise<PublicPage> {
    const [fav] = await this.database
      .select({ userId: pageFavorites.userId })
      .from(pageFavorites)
      .where(and(eq(pageFavorites.userId, userId), eq(pageFavorites.pageId, page.id)))
      .limit(1);
    return this.toPublic(page, Boolean(fav));
  }

  private toPublic(page: PageRow | PublicPage, favorited: boolean): PublicPage {
    const status = PAGE_STATUSES.includes(page.status as PageStatus)
      ? (page.status as PageStatus)
      : '';
    return {
      id: page.id,
      workspaceId: page.workspaceId,
      title: page.title,
      parentId: page.parentId,
      position: page.position,
      deletedAt: page.deletedAt,
      status,
      kind: asKind(page.kind),
      slug: page.slug,
      favorited,
    };
  }

  private async nextPosition(workspaceId: string, parentId: string | null): Promise<number> {
    const parentFilter = parentId ? eq(pages.parentId, parentId) : isNull(pages.parentId);
    const [{ nextPos }] = await this.database
      .select({ nextPos: max(pages.position) })
      .from(pages)
      .where(and(eq(pages.workspaceId, workspaceId), parentFilter, isNull(pages.deletedAt)));
    return (nextPos ?? -1) + 1;
  }

  private async descendantIds(
    workspaceId: string,
    rootId: string,
    includeRoot: boolean
  ): Promise<string[]> {
    const rows = await this.database
      .select({ id: pages.id, parentId: pages.parentId })
      .from(pages)
      .where(eq(pages.workspaceId, workspaceId));
    const children = new Map<string | null, string[]>();
    for (const row of rows) {
      const list = children.get(row.parentId) ?? [];
      list.push(row.id);
      children.set(row.parentId, list);
    }
    const ids: string[] = [];
    const walk = (id: string) => {
      ids.push(id);
      for (const child of children.get(id) ?? []) {
        walk(child);
      }
    };
    walk(rootId);
    return includeRoot ? ids : ids.slice(1);
  }

  private async assertNoCycle(
    workspaceId: string,
    pageId: string,
    parentId: string | null
  ): Promise<void> {
    if (!parentId) return;
    if (parentId === pageId) {
      throw new HttpError('A page cannot be its own parent', 400, 'CYCLE');
    }
    const rows = await this.database
      .select({ id: pages.id, parentId: pages.parentId })
      .from(pages)
      .where(eq(pages.workspaceId, workspaceId));
    const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));
    let cursor: string | null = parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === pageId) {
        throw new HttpError('A page cannot be nested under its descendant', 400, 'CYCLE');
      }
      if (seen.has(cursor)) break;
      seen.add(cursor);
      cursor = parentOf.get(cursor) ?? null;
    }
  }

  private async assertParentInWorkspace(
    workspaceId: string,
    parentId: string | null | undefined
  ): Promise<void> {
    if (!parentId) return;
    const parent = await this.findRow(parentId);
    if (!parent || parent.workspaceId !== workspaceId || parent.deletedAt) {
      throw new HttpError('Parent page not found', 400, 'INVALID_PARENT');
    }
    if (asKind(parent.kind) === 'markdown') {
      throw new HttpError('Markdown documents cannot have children', 400, 'INVALID_PARENT');
    }
  }

  private async allocateSlug(
    workspaceId: string,
    parentId: string | null,
    desiredRaw: string,
    excludeId?: string
  ): Promise<string> {
    const base = slugify(desiredRaw);
    const siblings = await this.database
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
    throw new HttpError('Could not allocate a unique slug', 409, 'SLUG_TAKEN');
  }
}
