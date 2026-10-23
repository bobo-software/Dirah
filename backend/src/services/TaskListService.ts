import { and, asc, count, eq, inArray, isNull, max, or, sql } from 'drizzle-orm';
import { taskListItems, taskLists } from '../db/schemas';
import { HttpError } from '../utils/HttpError';
import { markdownListItems } from '../utils/markdownList';
import { type AuthService, type Database } from './AuthService';
import type { NoteService } from './NoteService';

export const TASK_LIST_VISIBILITIES = ['private', 'workspace'] as const;
export type TaskListVisibility = (typeof TASK_LIST_VISIBILITIES)[number];

/** How a list is "run". The web runner keys its labels and behaviour off this. */
export const TASK_LIST_MODES = ['checklist'] as const;
export type TaskListMode = (typeof TASK_LIST_MODES)[number];

export const MAX_TASK_ITEM_TEXT = 500;
export const MAX_TASK_ITEMS_PER_ADD = 200;

export interface PublicTaskList {
  id: string;
  workspaceId: string;
  authorId: string;
  title: string;
  icon: string | null;
  mode: TaskListMode;
  visibility: TaskListVisibility;
  position: number;
  editable: boolean;
  itemCount: number;
  checkedCount: number;
  lastRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicTaskItem {
  id: string;
  listId: string;
  text: string;
  checked: boolean;
  checkedAt: Date | null;
  checkedBy: string | null;
  position: number;
}

export interface TaskListView {
  list: PublicTaskList;
  items: PublicTaskItem[];
}

const listColumns = {
  id: taskLists.id,
  workspaceId: taskLists.workspaceId,
  authorId: taskLists.authorId,
  title: taskLists.title,
  icon: taskLists.icon,
  mode: taskLists.mode,
  visibility: taskLists.visibility,
  position: taskLists.position,
  lastRunAt: taskLists.lastRunAt,
  deletedAt: taskLists.deletedAt,
  createdAt: taskLists.createdAt,
  updatedAt: taskLists.updatedAt,
};

type ListRow = {
  id: string;
  workspaceId: string;
  authorId: string;
  title: string;
  icon: string | null;
  mode: string;
  visibility: string;
  position: number;
  lastRunAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const itemColumns = {
  id: taskListItems.id,
  listId: taskListItems.listId,
  text: taskListItems.text,
  checked: taskListItems.checked,
  checkedAt: taskListItems.checkedAt,
  checkedBy: taskListItems.checkedBy,
  position: taskListItems.position,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asVisibility(value: string): TaskListVisibility {
  return value === 'workspace' ? 'workspace' : 'private';
}

function asMode(value: string): TaskListMode {
  return TASK_LIST_MODES.includes(value as TaskListMode) ? (value as TaskListMode) : 'checklist';
}

function cleanTitle(raw: string | undefined): string {
  return (raw ?? 'Untitled').trim() || 'Untitled';
}

function cleanItemText(raw: string): string {
  const text = raw.trim();
  if (!text || text.length > MAX_TASK_ITEM_TEXT) {
    throw new HttpError(`Item text must be 1–${MAX_TASK_ITEM_TEXT} characters`, 400, 'INVALID_ITEM_TEXT');
  }
  return text;
}

/**
 * Task lists: short, ordered lists of items that can be "run" one at a time.
 * Visibility follows notes: private lists are author-only, workspace lists are
 * visible to every member. Anyone who can see a list can check its items;
 * changing the items themselves needs the author, or an editor on shared lists.
 */
export class TaskListService {
  constructor(
    private readonly database: Database,
    private readonly auth: AuthService,
    private readonly notes: NoteService
  ) {}

  async list(userId: string, workspaceId: string): Promise<PublicTaskList[]> {
    await this.auth.requireMember(userId, workspaceId);
    const rows = await this.database
      .select(listColumns)
      .from(taskLists)
      .where(
        and(
          eq(taskLists.workspaceId, workspaceId),
          isNull(taskLists.deletedAt),
          or(eq(taskLists.authorId, userId), eq(taskLists.visibility, 'workspace'))
        )
      )
      .orderBy(asc(taskLists.position), asc(taskLists.createdAt));
    const counts = await this.countsFor(rows.map((row) => row.id));
    return rows.map((row) => this.toPublic(row, userId, counts.get(row.id)));
  }

  async create(
    userId: string,
    workspaceId: string,
    input: { title?: string; icon?: string | null; visibility?: TaskListVisibility; mode?: TaskListMode }
  ): Promise<PublicTaskList> {
    const workspace = await this.auth.requireMember(userId, workspaceId);
    this.assertNotEncrypted(workspace.encrypted);
    const [{ nextPos }] = await this.database
      .select({ nextPos: max(taskLists.position) })
      .from(taskLists)
      .where(and(eq(taskLists.workspaceId, workspaceId), isNull(taskLists.deletedAt)));
    const [row] = await this.database
      .insert(taskLists)
      .values({
        workspaceId,
        authorId: userId,
        title: cleanTitle(input.title),
        icon: input.icon ?? null,
        visibility: input.visibility ?? 'private',
        mode: input.mode ?? 'checklist',
        position: (nextPos ?? -1) + 1,
      })
      .returning(listColumns);
    return this.toPublic(row, userId);
  }

  /**
   * Copies a note's list lines (bullets, numbers, `- [ ]` / `- [x]`) into a new
   * private checklist in the note's workspace. The note itself is unchanged.
   */
  async createFromNote(userId: string, noteId: string): Promise<TaskListView> {
    const { note, content } = await this.notes.get(userId, noteId);
    const parsed = markdownListItems(content);
    if (parsed.length === 0) {
      throw new HttpError('This note has no list items to turn into a checklist', 400, 'NO_LIST_ITEMS');
    }
    if (parsed.length > MAX_TASK_ITEMS_PER_ADD) {
      throw new HttpError(`A checklist can take at most ${MAX_TASK_ITEMS_PER_ADD} items at once`, 400, 'TOO_MANY_ITEMS');
    }
    const list = await this.create(userId, note.workspaceId, { title: note.title, icon: note.icon });
    const now = new Date();
    try {
      await this.database.insert(taskListItems).values(
        parsed.map((item, position) => ({
          listId: list.id,
          text: item.text.slice(0, MAX_TASK_ITEM_TEXT),
          checked: item.checked,
          checkedAt: item.checked ? now : null,
          checkedBy: item.checked ? userId : null,
          position,
        }))
      );
    } catch (error) {
      await this.database.delete(taskLists).where(eq(taskLists.id, list.id));
      throw error;
    }
    return this.get(userId, list.id);
  }

  async get(userId: string, listId: string): Promise<TaskListView> {
    const row = await this.requireVisibleList(userId, listId);
    return this.view(userId, row);
  }

  async patch(
    userId: string,
    listId: string,
    input: { title?: string; icon?: string | null; visibility?: TaskListVisibility; position?: number }
  ): Promise<PublicTaskList> {
    const row = await this.requireAuthorList(userId, listId);
    const [updated] = await this.database
      .update(taskLists)
      .set({
        title: input.title !== undefined ? cleanTitle(input.title) : row.title,
        icon: input.icon !== undefined ? input.icon : row.icon,
        visibility: input.visibility ?? asVisibility(row.visibility),
        position: input.position ?? row.position,
        updatedAt: new Date(),
      })
      .where(eq(taskLists.id, listId))
      .returning(listColumns);
    const counts = await this.countsFor([listId]);
    return this.toPublic(updated, userId, counts.get(listId));
  }

  async remove(userId: string, listId: string): Promise<void> {
    await this.requireAuthorList(userId, listId);
    await this.database
      .update(taskLists)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(taskLists.id, listId));
  }

  async addItems(userId: string, listId: string, texts: string[]): Promise<TaskListView> {
    const row = await this.requireItemEditor(userId, listId);
    const cleaned = texts.map((text) => text.trim()).filter(Boolean).map(cleanItemText);
    if (cleaned.length === 0) {
      throw new HttpError('Add at least one item', 400, 'INVALID_ITEM_TEXT');
    }
    if (cleaned.length > MAX_TASK_ITEMS_PER_ADD) {
      throw new HttpError(`Add at most ${MAX_TASK_ITEMS_PER_ADD} items at once`, 400, 'TOO_MANY_ITEMS');
    }
    const [{ nextPos }] = await this.database
      .select({ nextPos: max(taskListItems.position) })
      .from(taskListItems)
      .where(eq(taskListItems.listId, listId));
    const start = (nextPos ?? -1) + 1;
    await this.database
      .insert(taskListItems)
      .values(cleaned.map((text, index) => ({ listId, text, position: start + index })));
    await this.touch(listId);
    return this.view(userId, row);
  }

  async orderItems(userId: string, listId: string, itemIds: string[]): Promise<TaskListView> {
    const row = await this.requireItemEditor(userId, listId);
    const items = await this.database
      .select({ id: taskListItems.id })
      .from(taskListItems)
      .where(eq(taskListItems.listId, listId));
    const existing = new Set(items.map((item) => item.id));
    const unique = new Set(itemIds);
    if (itemIds.length !== existing.size || unique.size !== itemIds.length || itemIds.some((id) => !existing.has(id))) {
      throw new HttpError('Item order must list every item once', 400, 'INVALID_ORDER');
    }
    await this.database.transaction(async (tx) => {
      for (const [position, id] of itemIds.entries()) {
        await tx.update(taskListItems).set({ position }).where(eq(taskListItems.id, id));
      }
    });
    return this.view(userId, row);
  }

  /** Unchecks every item, so the next run starts from scratch. */
  async reset(userId: string, listId: string): Promise<TaskListView> {
    const row = await this.requireVisibleList(userId, listId);
    await this.database
      .update(taskListItems)
      .set({ checked: false, checkedAt: null, checkedBy: null, updatedAt: new Date() })
      .where(eq(taskListItems.listId, listId));
    return this.view(userId, row);
  }

  async patchItem(
    userId: string,
    itemId: string,
    input: { text?: string; checked?: boolean }
  ): Promise<PublicTaskItem> {
    const item = await this.requireItemRow(itemId);
    if (input.text !== undefined) {
      await this.requireItemEditor(userId, item.listId);
    } else {
      await this.requireVisibleList(userId, item.listId);
    }
    const now = new Date();
    const changes: Partial<typeof taskListItems.$inferInsert> = { updatedAt: now };
    if (input.text !== undefined) changes.text = cleanItemText(input.text);
    if (input.checked !== undefined) {
      changes.checked = input.checked;
      changes.checkedAt = input.checked ? now : null;
      changes.checkedBy = input.checked ? userId : null;
    }
    const [updated] = await this.database
      .update(taskListItems)
      .set(changes)
      .where(eq(taskListItems.id, itemId))
      .returning(itemColumns);
    if (input.checked !== undefined) {
      await this.database.update(taskLists).set({ lastRunAt: now }).where(eq(taskLists.id, item.listId));
    }
    return updated;
  }

  async removeItem(userId: string, itemId: string): Promise<void> {
    const item = await this.requireItemRow(itemId);
    await this.requireItemEditor(userId, item.listId);
    await this.database.delete(taskListItems).where(eq(taskListItems.id, itemId));
    await this.touch(item.listId);
  }

  /** Hidden lists 404 rather than 403 so their existence does not leak. */
  private async requireVisibleList(userId: string, listId: string): Promise<ListRow> {
    const row = UUID_RE.test(listId)
      ? (await this.database.select(listColumns).from(taskLists).where(eq(taskLists.id, listId)).limit(1))[0]
      : undefined;
    if (!row || row.deletedAt || (row.authorId !== userId && row.visibility !== 'workspace')) {
      throw new HttpError('Task list not found', 404, 'TASK_LIST_NOT_FOUND');
    }
    await this.auth.requireMember(userId, row.workspaceId);
    return row;
  }

  private async requireAuthorList(userId: string, listId: string): Promise<ListRow> {
    const row = await this.requireVisibleList(userId, listId);
    if (row.authorId !== userId) {
      throw new HttpError('Only the author can change this list', 403, 'FORBIDDEN');
    }
    return row;
  }

  /** The author, or a workspace editor on a shared list, may change its items. */
  private async requireItemEditor(userId: string, listId: string): Promise<ListRow> {
    const row = await this.requireVisibleList(userId, listId);
    if (row.authorId !== userId) {
      await this.auth.requireEditor(userId, row.workspaceId);
    }
    return row;
  }

  private async requireItemRow(itemId: string) {
    const row = UUID_RE.test(itemId)
      ? (
          await this.database
            .select({ id: taskListItems.id, listId: taskListItems.listId })
            .from(taskListItems)
            .where(eq(taskListItems.id, itemId))
            .limit(1)
        )[0]
      : undefined;
    if (!row) {
      throw new HttpError('Item not found', 404, 'TASK_ITEM_NOT_FOUND');
    }
    return row;
  }

  private assertNotEncrypted(encrypted: boolean | undefined): void {
    if (encrypted) {
      throw new HttpError('Task lists are not available in encrypted workspaces yet', 409, 'TASKS_ENCRYPTION_PENDING');
    }
  }

  private async touch(listId: string): Promise<void> {
    await this.database.update(taskLists).set({ updatedAt: new Date() }).where(eq(taskLists.id, listId));
  }

  private async view(userId: string, row: ListRow): Promise<TaskListView> {
    const items = await this.database
      .select(itemColumns)
      .from(taskListItems)
      .where(eq(taskListItems.listId, row.id))
      .orderBy(asc(taskListItems.position), asc(taskListItems.createdAt));
    const [fresh] = await this.database.select(listColumns).from(taskLists).where(eq(taskLists.id, row.id)).limit(1);
    return {
      list: this.toPublic(fresh ?? row, userId, {
        itemCount: items.length,
        checkedCount: items.filter((item) => item.checked).length,
      }),
      items,
    };
  }

  private async countsFor(listIds: string[]): Promise<Map<string, { itemCount: number; checkedCount: number }>> {
    const counts = new Map<string, { itemCount: number; checkedCount: number }>();
    if (listIds.length === 0) return counts;
    const rows = await this.database
      .select({
        listId: taskListItems.listId,
        itemCount: count(),
        checkedCount: sql<number>`count(*) filter (where ${taskListItems.checked})`.mapWith(Number),
      })
      .from(taskListItems)
      .where(inArray(taskListItems.listId, listIds))
      .groupBy(taskListItems.listId);
    for (const row of rows) {
      counts.set(row.listId, { itemCount: row.itemCount, checkedCount: row.checkedCount });
    }
    return counts;
  }

  private toPublic(
    row: ListRow,
    userId: string,
    counts: { itemCount: number; checkedCount: number } = { itemCount: 0, checkedCount: 0 }
  ): PublicTaskList {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      authorId: row.authorId,
      title: row.title,
      icon: row.icon,
      mode: asMode(row.mode),
      visibility: asVisibility(row.visibility),
      position: row.position,
      editable: row.authorId === userId,
      itemCount: counts.itemCount,
      checkedCount: counts.checkedCount,
      lastRunAt: row.lastRunAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
