import { and, asc, eq, exists, ilike, inArray, isNotNull, isNull, max, or, sql } from 'drizzle-orm';
import { notes, noteTagLinks, noteTags } from '../db/schemas';
import { HttpError } from '../utils/HttpError';
import {
  excerptFromSearchText,
  hashMarkdown,
  markdownSearchText,
  normalizeDocsSearchQuery,
} from '../utils/slugify';
import { type AuthService, type Database } from './AuthService';
import { diffPreview, EMPTY_MARKDOWN_HASH, MAX_MARKDOWN_BYTES } from './PageService';

export const NOTE_VISIBILITIES = ['private', 'workspace'] as const;
export type NoteVisibility = (typeof NOTE_VISIBILITIES)[number];

export type NoteScope = 'mine' | 'shared';

export interface PublicNote {
  id: string;
  workspaceId: string;
  authorId: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  cover: string | null;
  visibility: NoteVisibility;
  position: number;
  pinnedAt: Date | null;
  tagIds: string[];
  editable: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  excerpt: string;
}

export interface NoteBody {
  note: PublicNote;
  content: string;
  hash: string;
  updatedAt: Date;
}

export interface PublicNoteTag {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
}

export interface ListNotesQuery {
  trashed?: boolean;
  q?: string;
  tagId?: string;
  scope?: NoteScope;
}

const noteColumns = {
  id: notes.id,
  workspaceId: notes.workspaceId,
  authorId: notes.authorId,
  parentId: notes.parentId,
  title: notes.title,
  icon: notes.icon,
  cover: notes.cover,
  visibility: notes.visibility,
  position: notes.position,
  pinnedAt: notes.pinnedAt,
  deletedAt: notes.deletedAt,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
  searchTextPreview: sql<string>`left(${notes.searchText}, 400)`,
};

type NoteRow = {
  id: string;
  workspaceId: string;
  authorId: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  cover: string | null;
  visibility: string;
  position: number;
  pinnedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  searchTextPreview: string;
};

const tagColumns = {
  id: noteTags.id,
  workspaceId: noteTags.workspaceId,
  name: noteTags.name,
  color: noteTags.color,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asVisibility(value: string): NoteVisibility {
  return value === 'workspace' ? 'workspace' : 'private';
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function cleanTagName(raw: string): string {
  const name = raw.trim();
  if (!name || name.length > 40) {
    throw new HttpError('Tag name must be 1–40 characters', 400, 'INVALID_TAG_NAME');
  }
  return name;
}

/**
 * Personal notes. A note is readable by its author, or by any workspace member
 * once its visibility is `workspace`; only the author writes. A note always
 * shares its parent's visibility and author, so a shared tree never hides a
 * private branch and a private tree never exposes a shared one.
 */
export class NoteService {
  constructor(
    private readonly database: Database,
    private readonly auth: AuthService
  ) {}

  async list(userId: string, workspaceId: string, query: ListNotesQuery = {}): Promise<PublicNote[]> {
    await this.auth.requireMember(userId, workspaceId);
    const filters = [eq(notes.workspaceId, workspaceId)];
    if (query.trashed) {
      filters.push(isNotNull(notes.deletedAt), eq(notes.authorId, userId));
    } else {
      filters.push(isNull(notes.deletedAt), this.visibleFilter(userId));
    }
    if (query.scope === 'mine') {
      filters.push(eq(notes.authorId, userId));
    } else if (query.scope === 'shared') {
      filters.push(eq(notes.visibility, 'workspace'));
    }
    if (query.tagId) {
      filters.push(
        exists(
          this.database
            .select({ one: sql`1` })
            .from(noteTagLinks)
            .where(and(eq(noteTagLinks.noteId, notes.id), eq(noteTagLinks.tagId, query.tagId)))
        )
      );
    }
    const q = query.q?.trim();
    if (q) {
      const match = this.searchPredicate(q);
      if (match) filters.push(match);
    }
    const rows = await this.database
      .select(noteColumns)
      .from(notes)
      .where(and(...filters))
      .orderBy(asc(notes.position), asc(notes.createdAt));
    const tagIds = await this.tagIdsFor(rows.map((row) => row.id));
    return rows.map((row) => this.toPublic(row, userId, tagIds.get(row.id) ?? []));
  }

  async get(userId: string, noteId: string): Promise<NoteBody> {
    const note = await this.requireVisibleNote(userId, noteId);
    const [row] = await this.database
      .select({ content: notes.content, hash: notes.contentHash, updatedAt: notes.updatedAt })
      .from(notes)
      .where(eq(notes.id, noteId))
      .limit(1);
    return { note, content: row.content, hash: row.hash, updatedAt: row.updatedAt };
  }

  async create(
    userId: string,
    workspaceId: string,
    input: {
      title?: string;
      parentId?: string | null;
      icon?: string | null;
      cover?: string | null;
      visibility?: NoteVisibility;
    }
  ): Promise<PublicNote> {
    const workspace = await this.auth.requireMember(userId, workspaceId);
    this.assertNotEncrypted(workspace.encrypted);
    const parentId = input.parentId ?? null;
    let visibility: NoteVisibility = input.visibility ?? 'private';
    if (parentId) {
      const parent = await this.requireParent(userId, workspaceId, parentId);
      if (input.visibility && input.visibility !== parent.visibility) {
        throw this.visibilityConflict();
      }
      visibility = asVisibility(parent.visibility);
    }
    const title = (input.title ?? 'Untitled').trim() || 'Untitled';
    const position = await this.nextPosition(workspaceId, userId, parentId);
    const [created] = await this.database
      .insert(notes)
      .values({
        workspaceId,
        authorId: userId,
        parentId,
        title,
        icon: input.icon ?? null,
        cover: input.cover ?? null,
        visibility,
        position,
        content: '',
        contentHash: EMPTY_MARKDOWN_HASH,
      })
      .returning(noteColumns);
    return this.toPublic(created, userId, []);
  }

  async patch(
    userId: string,
    noteId: string,
    input: {
      title?: string;
      icon?: string | null;
      cover?: string | null;
      parentId?: string | null;
      position?: number;
      visibility?: NoteVisibility;
      pinned?: boolean;
    }
  ): Promise<PublicNote> {
    const note = await this.requireAuthorNote(userId, noteId);
    const parentChanged = input.parentId !== undefined && input.parentId !== note.parentId;
    const parentId = input.parentId === undefined ? note.parentId : input.parentId;
    const visibility = input.visibility ?? note.visibility;

    if (parentChanged && parentId) {
      await this.assertNoCycle(note.workspaceId, noteId, parentId);
    }
    if (parentId && (parentChanged || input.visibility !== undefined)) {
      const parent = await this.requireParent(userId, note.workspaceId, parentId);
      if (parent.visibility !== visibility) {
        throw this.visibilityConflict();
      }
    }

    const title = input.title !== undefined ? input.title.trim() || 'Untitled' : note.title;
    const position =
      input.position ??
      (parentChanged ? await this.nextPosition(note.workspaceId, userId, parentId) : note.position);
    const pinnedAt =
      input.pinned === undefined ? note.pinnedAt : input.pinned ? (note.pinnedAt ?? new Date()) : null;
    const now = new Date();

    const updated = await this.database.transaction(async (tx) => {
      const [row] = await tx
        .update(notes)
        .set({
          title,
          icon: input.icon === undefined ? note.icon : input.icon,
          cover: input.cover === undefined ? note.cover : input.cover,
          parentId,
          position,
          visibility,
          pinnedAt,
          updatedAt: now,
        })
        .where(eq(notes.id, noteId))
        .returning(noteColumns);
      if (visibility !== note.visibility) {
        const descendants = await this.descendantIds(note.workspaceId, noteId, false);
        if (descendants.length > 0) {
          await tx
            .update(notes)
            .set({ visibility, updatedAt: now })
            .where(inArray(notes.id, descendants));
        }
      }
      return row;
    });
    return this.toPublic(updated, userId, note.tagIds);
  }

  async putContent(
    userId: string,
    noteId: string,
    content: string,
    expectedHash?: string
  ): Promise<NoteBody> {
    const note = await this.requireAuthorNote(userId, noteId);
    const workspace = await this.auth.requireMember(userId, note.workspaceId);
    this.assertNotEncrypted(workspace.encrypted);
    if (Buffer.byteLength(content, 'utf8') > MAX_MARKDOWN_BYTES) {
      throw new HttpError('Note is too large', 413, 'NOTE_TOO_LARGE');
    }
    const [current] = await this.database
      .select({ content: notes.content, hash: notes.contentHash })
      .from(notes)
      .where(eq(notes.id, noteId))
      .limit(1);
    if (expectedHash && expectedHash !== current.hash) {
      throw new HttpError('Note was updated elsewhere', 409, 'HASH_MISMATCH', {
        currentHash: current.hash,
        diffPreview: diffPreview(current.content, content),
      });
    }
    const hash = hashMarkdown(content);
    const [updated] = await this.database
      .update(notes)
      .set({
        content,
        contentHash: hash,
        searchText: markdownSearchText(content).slice(0, 200_000),
        updatedAt: new Date(),
      })
      .where(eq(notes.id, noteId))
      .returning(noteColumns);
    return {
      note: this.toPublic(updated, userId, note.tagIds),
      content,
      hash,
      updatedAt: updated.updatedAt,
    };
  }

  async trash(userId: string, noteId: string): Promise<void> {
    const note = await this.requireAuthorNote(userId, noteId);
    const ids = await this.descendantIds(note.workspaceId, noteId, true);
    const now = new Date();
    await this.database
      .update(notes)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(inArray(notes.id, ids), isNull(notes.deletedAt)));
  }

  async restore(userId: string, noteId: string): Promise<PublicNote> {
    const note = await this.requireAuthorNote(userId, noteId, { includeTrashed: true });
    if (!note.deletedAt) {
      return note;
    }
    let parentId = note.parentId;
    if (parentId) {
      const parent = await this.findRow(parentId);
      if (!parent || parent.deletedAt || parent.visibility !== note.visibility) {
        parentId = null;
      }
    }
    const [restored] = await this.database
      .update(notes)
      .set({ deletedAt: null, parentId, updatedAt: new Date() })
      .where(eq(notes.id, noteId))
      .returning(noteColumns);
    return this.toPublic(restored, userId, note.tagIds);
  }

  async removePermanent(userId: string, noteId: string): Promise<string[]> {
    const note = await this.requireAuthorNote(userId, noteId, { includeTrashed: true });
    if (!note.deletedAt) {
      throw new HttpError('Trash the note before permanently deleting it', 400, 'NOT_TRASHED');
    }
    const ids = await this.descendantIds(note.workspaceId, noteId, true);
    await this.database.delete(notes).where(inArray(notes.id, ids));
    return ids;
  }

  async setTags(userId: string, noteId: string, tagIdsRaw: string[]): Promise<PublicNote> {
    const note = await this.requireAuthorNote(userId, noteId);
    const tagIds = [...new Set(tagIdsRaw)];
    if (tagIds.length > 0) {
      const found = await this.database
        .select({ id: noteTags.id })
        .from(noteTags)
        .where(and(eq(noteTags.workspaceId, note.workspaceId), inArray(noteTags.id, tagIds)));
      if (found.length !== tagIds.length) {
        throw new HttpError('Unknown tag', 400, 'INVALID_TAG');
      }
    }
    await this.database.transaction(async (tx) => {
      await tx.delete(noteTagLinks).where(eq(noteTagLinks.noteId, noteId));
      if (tagIds.length > 0) {
        await tx.insert(noteTagLinks).values(tagIds.map((tagId) => ({ noteId, tagId })));
      }
    });
    return { ...note, tagIds };
  }

  async listTags(userId: string, workspaceId: string): Promise<PublicNoteTag[]> {
    await this.auth.requireMember(userId, workspaceId);
    return this.database
      .select(tagColumns)
      .from(noteTags)
      .where(eq(noteTags.workspaceId, workspaceId))
      .orderBy(asc(sql`lower(${noteTags.name})`));
  }

  async createTag(
    userId: string,
    workspaceId: string,
    input: { name: string; color?: string }
  ): Promise<PublicNoteTag> {
    await this.auth.requireMember(userId, workspaceId);
    const name = cleanTagName(input.name);
    try {
      const [tag] = await this.database
        .insert(noteTags)
        .values({ workspaceId, name, color: input.color ?? '' })
        .returning(tagColumns);
      return tag;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError('A tag with that name already exists', 409, 'TAG_EXISTS');
      }
      throw error;
    }
  }

  /** Tags are shared vocabulary, so renaming or deleting one needs editor rights. */
  async patchTag(
    userId: string,
    tagId: string,
    input: { name?: string; color?: string }
  ): Promise<PublicNoteTag> {
    const tag = await this.requireTag(tagId);
    await this.auth.requireEditor(userId, tag.workspaceId);
    try {
      const [updated] = await this.database
        .update(noteTags)
        .set({
          name: input.name === undefined ? tag.name : cleanTagName(input.name),
          color: input.color ?? tag.color,
        })
        .where(eq(noteTags.id, tagId))
        .returning(tagColumns);
      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError('A tag with that name already exists', 409, 'TAG_EXISTS');
      }
      throw error;
    }
  }

  async deleteTag(userId: string, tagId: string): Promise<void> {
    const tag = await this.requireTag(tagId);
    await this.auth.requireEditor(userId, tag.workspaceId);
    await this.database.delete(noteTags).where(eq(noteTags.id, tagId));
  }

  /** Hidden notes 404 rather than 403 so their existence does not leak. */
  async requireVisibleNote(
    userId: string,
    noteId: string,
    options: { includeTrashed?: boolean } = {}
  ): Promise<PublicNote> {
    const row = await this.findRow(noteId);
    const hidden =
      !row ||
      (row.authorId !== userId && (row.visibility !== 'workspace' || row.deletedAt)) ||
      (!options.includeTrashed && row.deletedAt);
    if (!row || hidden) {
      throw new HttpError('Note not found', 404, 'NOTE_NOT_FOUND');
    }
    await this.auth.requireMember(userId, row.workspaceId);
    const tagIds = await this.tagIdsFor([row.id]);
    return this.toPublic(row, userId, tagIds.get(row.id) ?? []);
  }

  async requireAuthorNote(
    userId: string,
    noteId: string,
    options: { includeTrashed?: boolean } = {}
  ): Promise<PublicNote> {
    const note = await this.requireVisibleNote(userId, noteId, options);
    if (!note.editable) {
      throw new HttpError('Only the author can change this note', 403, 'FORBIDDEN');
    }
    return note;
  }

  private visibleFilter(userId: string) {
    return or(eq(notes.authorId, userId), eq(notes.visibility, 'workspace'))!;
  }

  private searchPredicate(q: string) {
    const parsed = normalizeDocsSearchQuery(q);
    if (!parsed) return undefined;
    return or(
      ilike(notes.title, `%${parsed.raw}%`),
      sql`notes.search_tsv @@ plainto_tsquery('english', ${parsed.fts})`
    );
  }

  private assertNotEncrypted(encrypted: boolean | undefined): void {
    if (encrypted) {
      throw new HttpError(
        'Notes are not available in encrypted workspaces yet',
        409,
        'NOTES_ENCRYPTION_PENDING'
      );
    }
  }

  private visibilityConflict(): HttpError {
    return new HttpError(
      'A note must have the same visibility as its parent',
      400,
      'VISIBILITY_CONFLICT'
    );
  }

  private async requireParent(userId: string, workspaceId: string, parentId: string): Promise<NoteRow> {
    const parent = await this.findRow(parentId);
    if (
      !parent ||
      parent.workspaceId !== workspaceId ||
      parent.authorId !== userId ||
      parent.deletedAt
    ) {
      throw new HttpError('Parent note not found', 400, 'INVALID_PARENT');
    }
    return parent;
  }

  private async requireTag(tagId: string) {
    if (!UUID_RE.test(tagId)) {
      throw new HttpError('Tag not found', 404, 'TAG_NOT_FOUND');
    }
    const [tag] = await this.database
      .select(tagColumns)
      .from(noteTags)
      .where(eq(noteTags.id, tagId))
      .limit(1);
    if (!tag) {
      throw new HttpError('Tag not found', 404, 'TAG_NOT_FOUND');
    }
    return tag;
  }

  private async findRow(noteId: string): Promise<NoteRow | null> {
    if (!UUID_RE.test(noteId)) return null;
    const [row] = await this.database
      .select(noteColumns)
      .from(notes)
      .where(eq(notes.id, noteId))
      .limit(1);
    return row ?? null;
  }

  private async tagIdsFor(noteIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (noteIds.length === 0) return map;
    const links = await this.database
      .select({ noteId: noteTagLinks.noteId, tagId: noteTagLinks.tagId })
      .from(noteTagLinks)
      .where(inArray(noteTagLinks.noteId, noteIds));
    for (const link of links) {
      const list = map.get(link.noteId) ?? [];
      list.push(link.tagId);
      map.set(link.noteId, list);
    }
    return map;
  }

  private toPublic(row: NoteRow, userId: string, tagIds: string[]): PublicNote {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      authorId: row.authorId,
      parentId: row.parentId,
      title: row.title,
      icon: row.icon,
      cover: row.cover,
      visibility: asVisibility(row.visibility),
      position: row.position,
      pinnedAt: row.pinnedAt,
      tagIds,
      editable: row.authorId === userId,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      excerpt: excerptFromSearchText(row.searchTextPreview),
    };
  }

  private async nextPosition(
    workspaceId: string,
    authorId: string,
    parentId: string | null
  ): Promise<number> {
    const parentFilter = parentId ? eq(notes.parentId, parentId) : isNull(notes.parentId);
    const [{ nextPos }] = await this.database
      .select({ nextPos: max(notes.position) })
      .from(notes)
      .where(
        and(
          eq(notes.workspaceId, workspaceId),
          eq(notes.authorId, authorId),
          parentFilter,
          isNull(notes.deletedAt)
        )
      );
    return (nextPos ?? -1) + 1;
  }

  private async descendantIds(
    workspaceId: string,
    rootId: string,
    includeRoot: boolean
  ): Promise<string[]> {
    const rows = await this.database
      .select({ id: notes.id, parentId: notes.parentId })
      .from(notes)
      .where(and(eq(notes.workspaceId, workspaceId), isNotNull(notes.parentId)));
    const children = new Map<string, string[]>();
    for (const row of rows) {
      const list = children.get(row.parentId as string) ?? [];
      list.push(row.id);
      children.set(row.parentId as string, list);
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

  private async assertNoCycle(workspaceId: string, noteId: string, parentId: string): Promise<void> {
    if (parentId === noteId) {
      throw new HttpError('A note cannot be its own parent', 400, 'CYCLE');
    }
    const rows = await this.database
      .select({ id: notes.id, parentId: notes.parentId })
      .from(notes)
      .where(eq(notes.workspaceId, workspaceId));
    const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));
    let cursor: string | null = parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === noteId) {
        throw new HttpError('A note cannot be nested under its descendant', 400, 'CYCLE');
      }
      if (seen.has(cursor)) break;
      seen.add(cursor);
      cursor = parentOf.get(cursor) ?? null;
    }
  }
}
