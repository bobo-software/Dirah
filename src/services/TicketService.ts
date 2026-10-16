import { and, asc, desc, eq, ilike, inArray, isNull, max, ne, or, sql, type SQL } from 'drizzle-orm';
import {
  ticketActivity,
  ticketAssignees,
  ticketBoards,
  ticketComments,
  ticketGroups,
  ticketStatuses,
  tickets,
  users,
  workspaceMembers,
} from '../db/schemas';
import { canAdminMembers } from '../authz/roles';
import { HttpError } from '../utils/HttpError';
import { normalizeDocsSearchQuery } from '../utils/slugify';
import { type AuthService, type Database, type PublicWorkspace } from './AuthService';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Executor = Database | Tx;

export const TICKET_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUS_CATEGORIES = ['todo', 'doing', 'done'] as const;
export type TicketStatusCategory = (typeof TICKET_STATUS_CATEGORIES)[number];

/** Same palette names as the web's typed-table select colours. */
export const TICKET_COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const;
export type TicketColor = (typeof TICKET_COLORS)[number];

export const BOARD_KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;
export const MAX_TICKET_TITLE = 300;
export const MAX_TICKET_DESCRIPTION = 50_000;
export const MAX_TICKET_LABELS = 20;
export const MAX_TICKET_LABEL = 40;
export const MAX_COMMENT_BODY = 10_000;
const MAX_SEARCH_RESULTS = 200;

const DEFAULT_STATUSES: { name: string; color: TicketColor; category: TicketStatusCategory }[] = [
  { name: 'To do', color: 'gray', category: 'todo' },
  { name: 'In progress', color: 'blue', category: 'doing' },
  { name: 'Blocked', color: 'red', category: 'doing' },
  { name: 'Done', color: 'green', category: 'done' },
];
const DEFAULT_GROUP = { name: 'Backlog', color: 'blue' as TicketColor };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TICKET_KEY_RE = /^([A-Za-z][A-Za-z0-9]{1,9})[\s-]*(\d{1,9})$/;

export interface PublicTicketBoard {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  description: string | null;
  position: number;
  ticketCount: number;
  openCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicTicketStatus {
  id: string;
  boardId: string;
  name: string;
  color: string;
  category: TicketStatusCategory;
  position: number;
}

export interface PublicTicketGroup {
  id: string;
  boardId: string;
  name: string;
  color: string;
  position: number;
}

export interface PublicTicket {
  id: string;
  boardId: string;
  key: string;
  number: number;
  groupId: string;
  statusId: string;
  title: string;
  description: string;
  priority: TicketPriority;
  dueDate: string | null;
  labels: string[];
  position: number;
  statusPosition: number;
  assigneeIds: string[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A ticket found by workspace-wide search, with enough board context to show it alone. */
export interface TicketSearchResult extends PublicTicket {
  boardName: string;
  statusName: string;
  statusColor: string;
  statusCategory: TicketStatusCategory;
}

export interface TicketBoardView {
  board: PublicTicketBoard;
  statuses: PublicTicketStatus[];
  groups: PublicTicketGroup[];
  tickets: PublicTicket[];
}

export interface PublicTicketComment {
  id: string;
  ticketId: string;
  authorId: string | null;
  authorName: string | null;
  body: string;
  /** Only the author may edit. */
  editable: boolean;
  /** The author or a workspace owner may delete. */
  deletable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicTicketActivity {
  id: string;
  ticketId: string;
  actorId: string | null;
  actorName: string | null;
  type: string;
  data: Record<string, unknown>;
  createdAt: Date;
}

export interface TicketDetail {
  ticket: PublicTicket;
  board: PublicTicketBoard;
  status: PublicTicketStatus;
  group: PublicTicketGroup;
  comments: PublicTicketComment[];
  activity: PublicTicketActivity[];
}

export interface TicketInput {
  title?: string;
  description?: string;
  groupId?: string;
  statusId?: string;
  priority?: TicketPriority;
  dueDate?: string | null;
  labels?: string[];
  assigneeIds?: string[];
}

export interface TicketSearchFilter {
  q?: string;
  assigneeId?: string;
  boardId?: string;
  /** A status category, or "open" for anything not done. */
  state?: TicketStatusCategory | 'open';
  limit?: number;
}

type BoardRow = typeof ticketBoards.$inferSelect;
type TicketRow = typeof tickets.$inferSelect;
type StatusRow = typeof ticketStatuses.$inferSelect;
type GroupRow = typeof ticketGroups.$inferSelect;

function cleanName(raw: string | undefined, fallback: string, label: string, maxLength = 120): string {
  const name = (raw ?? '').trim() || fallback;
  if (name.length > maxLength) {
    throw new HttpError(`${label} must be ${maxLength} characters or fewer`, 400, 'INVALID_NAME');
  }
  return name;
}

function cleanTitle(raw: string): string {
  const title = raw.trim();
  if (!title || title.length > MAX_TICKET_TITLE) {
    throw new HttpError(`Ticket title must be 1–${MAX_TICKET_TITLE} characters`, 400, 'INVALID_TITLE');
  }
  return title;
}

function cleanLabels(raw: string[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const value of raw) {
    const label = value.trim().slice(0, MAX_TICKET_LABEL);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    labels.push(label);
  }
  if (labels.length > MAX_TICKET_LABELS) {
    throw new HttpError(`A ticket can have at most ${MAX_TICKET_LABELS} labels`, 400, 'TOO_MANY_LABELS');
  }
  return labels;
}

function cleanColor(raw: string | undefined, fallback: TicketColor): TicketColor {
  return TICKET_COLORS.includes(raw as TicketColor) ? (raw as TicketColor) : fallback;
}

export function normalizeBoardKey(raw: string): string {
  const key = raw.trim().toUpperCase();
  if (!BOARD_KEY_RE.test(key)) {
    throw new HttpError(
      'Board key must be 2–10 letters or digits and start with a letter',
      400,
      'INVALID_BOARD_KEY'
    );
  }
  return key;
}

/** "Product roadmap" → "PR", "Dira" → "DIRA". Always a valid key shape. */
export function suggestBoardKey(name: string): string {
  const words = name.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  let key = words.length > 1 ? words.map((word) => word[0]).join('') : (words[0] ?? '');
  key = key.replace(/^[0-9]+/, '').slice(0, 6);
  if (key.length < 2) key = (key + 'TICKETS').slice(0, 4);
  return key;
}

export function parseTicketKey(raw: string): { key: string; number: number } | null {
  const match = TICKET_KEY_RE.exec(raw.trim());
  if (!match) return null;
  return { key: match[1].toUpperCase(), number: Number(match[2]) };
}

function asCategory(value: string): TicketStatusCategory {
  return TICKET_STATUS_CATEGORIES.includes(value as TicketStatusCategory) ? (value as TicketStatusCategory) : 'todo';
}

function asPriority(value: string): TicketPriority {
  return TICKET_PRIORITIES.includes(value as TicketPriority) ? (value as TicketPriority) : 'none';
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

/** Moves `id` to `index` within `target`, removing it from wherever it was. Returns every list to renumber. */
function reorder<T extends { id: string }>(
  items: T[],
  id: string,
  containerOf: (item: T) => string,
  positionOf: (item: T) => number,
  targetContainer: string,
  index: number | undefined
): { source: T[]; destination: T[]; sameContainer: boolean } {
  const moving = items.find((item) => item.id === id)!;
  const sameContainer = containerOf(moving) === targetContainer;
  const byPosition = (a: T, b: T) => positionOf(a) - positionOf(b);
  const source = items.filter((item) => containerOf(item) === containerOf(moving) && item.id !== id).sort(byPosition);
  const destination = sameContainer
    ? source
    : items.filter((item) => containerOf(item) === targetContainer).sort(byPosition);
  const at = Math.max(0, Math.min(index ?? destination.length, destination.length));
  destination.splice(at, 0, moving);
  return { source, destination, sameContainer };
}

/**
 * Tickets: Monday-style boards of work items. A board belongs to a workspace and
 * has its own statuses (kanban columns) and groups (table sections). Any member
 * can read; editors and owners can change boards, tickets and comments.
 */
export class TicketService {
  constructor(
    private readonly database: Database,
    private readonly auth: AuthService
  ) {}

  // ---------- boards ----------

  async listBoards(userId: string, workspaceId: string): Promise<PublicTicketBoard[]> {
    const workspace = await this.auth.requireMember(userId, workspaceId);
    this.assertNotEncrypted(workspace);
    const rows = await this.database
      .select()
      .from(ticketBoards)
      .where(and(eq(ticketBoards.workspaceId, workspaceId), isNull(ticketBoards.deletedAt)))
      .orderBy(asc(ticketBoards.position), asc(ticketBoards.createdAt));
    const counts = await this.boardCounts(rows.map((row) => row.id));
    return rows.map((row) => this.toBoard(row, counts.get(row.id)));
  }

  async createBoard(
    userId: string,
    workspaceId: string,
    input: { name?: string; key?: string; description?: string | null }
  ): Promise<TicketBoardView> {
    const workspace = await this.auth.requireEditor(userId, workspaceId);
    this.assertNotEncrypted(workspace);
    const name = cleanName(input.name, 'Untitled board', 'Board name');
    const key = input.key ? normalizeBoardKey(input.key) : await this.freeKey(workspaceId, suggestBoardKey(name));
    const [{ nextPos }] = await this.database
      .select({ nextPos: max(ticketBoards.position) })
      .from(ticketBoards)
      .where(and(eq(ticketBoards.workspaceId, workspaceId), isNull(ticketBoards.deletedAt)));
    let board: BoardRow;
    try {
      board = await this.database.transaction(async (tx) => {
        const [row] = await tx
          .insert(ticketBoards)
          .values({
            workspaceId,
            key,
            name,
            description: input.description?.trim() || null,
            position: (nextPos ?? -1) + 1,
            createdBy: userId,
          })
          .returning();
        await tx
          .insert(ticketStatuses)
          .values(DEFAULT_STATUSES.map((status, position) => ({ ...status, boardId: row.id, position })));
        await tx.insert(ticketGroups).values({ ...DEFAULT_GROUP, boardId: row.id, position: 0 });
        return row;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw this.keyTaken(key);
      throw error;
    }
    return this.boardView(board);
  }

  async getBoard(userId: string, boardId: string): Promise<TicketBoardView> {
    const board = await this.requireBoard(userId, boardId, false);
    return this.boardView(board);
  }

  async patchBoard(
    userId: string,
    boardId: string,
    input: { name?: string; key?: string; description?: string | null; position?: number }
  ): Promise<PublicTicketBoard> {
    const board = await this.requireBoard(userId, boardId, true);
    const changes: Partial<typeof ticketBoards.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) changes.name = cleanName(input.name, board.name, 'Board name');
    if (input.key !== undefined) changes.key = normalizeBoardKey(input.key);
    if (input.description !== undefined) changes.description = input.description?.trim() || null;
    if (input.position !== undefined) changes.position = input.position;
    let updated: BoardRow;
    try {
      [updated] = await this.database.update(ticketBoards).set(changes).where(eq(ticketBoards.id, boardId)).returning();
    } catch (error) {
      if (isUniqueViolation(error)) throw this.keyTaken(changes.key ?? board.key);
      throw error;
    }
    const counts = await this.boardCounts([boardId]);
    return this.toBoard(updated, counts.get(boardId));
  }

  async removeBoard(userId: string, boardId: string): Promise<void> {
    await this.requireBoard(userId, boardId, true);
    await this.database
      .update(ticketBoards)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(ticketBoards.id, boardId));
  }

  // ---------- statuses ----------

  async createStatus(
    userId: string,
    boardId: string,
    input: { name: string; color?: string; category?: TicketStatusCategory }
  ): Promise<PublicTicketStatus> {
    await this.requireBoard(userId, boardId, true);
    const [{ nextPos }] = await this.database
      .select({ nextPos: max(ticketStatuses.position) })
      .from(ticketStatuses)
      .where(eq(ticketStatuses.boardId, boardId));
    const [row] = await this.database
      .insert(ticketStatuses)
      .values({
        boardId,
        name: cleanName(input.name, '', 'Status name', 60) || 'Untitled',
        color: cleanColor(input.color, 'gray'),
        category: input.category ?? 'todo',
        position: (nextPos ?? -1) + 1,
      })
      .returning();
    await this.touchBoard(boardId);
    return this.toStatus(row);
  }

  async patchStatus(
    userId: string,
    statusId: string,
    input: { name?: string; color?: string; category?: TicketStatusCategory }
  ): Promise<PublicTicketStatus> {
    const status = await this.requireStatus(userId, statusId);
    const [row] = await this.database
      .update(ticketStatuses)
      .set({
        name: input.name !== undefined ? cleanName(input.name, status.name, 'Status name', 60) : status.name,
        color: input.color !== undefined ? cleanColor(input.color, 'gray') : status.color,
        category: input.category ?? status.category,
      })
      .where(eq(ticketStatuses.id, statusId))
      .returning();
    await this.touchBoard(status.boardId);
    return this.toStatus(row);
  }

  /**
   * Tickets in the deleted status move to `moveToStatusId` (or the first other
   * status when the column has no live tickets). The last status cannot go.
   */
  async removeStatus(userId: string, statusId: string, moveToStatusId?: string): Promise<TicketBoardView> {
    const status = await this.requireStatus(userId, statusId);
    const siblings = await this.database
      .select()
      .from(ticketStatuses)
      .where(and(eq(ticketStatuses.boardId, status.boardId), ne(ticketStatuses.id, statusId)))
      .orderBy(asc(ticketStatuses.position));
    if (siblings.length === 0) {
      throw new HttpError('A board needs at least one status', 400, 'LAST_STATUS');
    }
    const live = await this.liveTicketCount(eq(tickets.statusId, statusId));
    if (live > 0 && !moveToStatusId) {
      throw new HttpError('Choose a status to move this column’s tickets to', 400, 'MOVE_TARGET_REQUIRED');
    }
    const target = moveToStatusId ? siblings.find((item) => item.id === moveToStatusId) : siblings[0];
    if (!target) {
      throw new HttpError('Status not found', 404, 'STATUS_NOT_FOUND');
    }
    await this.database.transaction(async (tx) => {
      const [{ nextPos }] = await tx
        .select({ nextPos: max(tickets.statusPosition) })
        .from(tickets)
        .where(eq(tickets.statusId, target.id));
      await tx
        .update(tickets)
        .set({ statusId: target.id, statusPosition: sql`${(nextPos ?? -1) + 1} + ${tickets.statusPosition}` })
        .where(eq(tickets.statusId, statusId));
      await tx.delete(ticketStatuses).where(eq(ticketStatuses.id, statusId));
    });
    return this.boardView(await this.boardRow(status.boardId));
  }

  async orderStatuses(userId: string, boardId: string, statusIds: string[]): Promise<PublicTicketStatus[]> {
    await this.requireBoard(userId, boardId, true);
    await this.applyOrder(ticketStatuses, boardId, statusIds);
    return (await this.statusesFor(boardId)).map((row) => this.toStatus(row));
  }

  // ---------- groups ----------

  async createGroup(
    userId: string,
    boardId: string,
    input: { name: string; color?: string }
  ): Promise<PublicTicketGroup> {
    await this.requireBoard(userId, boardId, true);
    const [{ nextPos }] = await this.database
      .select({ nextPos: max(ticketGroups.position) })
      .from(ticketGroups)
      .where(eq(ticketGroups.boardId, boardId));
    const [row] = await this.database
      .insert(ticketGroups)
      .values({
        boardId,
        name: cleanName(input.name, '', 'Group name', 80) || 'New group',
        color: cleanColor(input.color, 'blue'),
        position: (nextPos ?? -1) + 1,
      })
      .returning();
    await this.touchBoard(boardId);
    return this.toGroup(row);
  }

  async patchGroup(userId: string, groupId: string, input: { name?: string; color?: string }): Promise<PublicTicketGroup> {
    const group = await this.requireGroup(userId, groupId);
    const [row] = await this.database
      .update(ticketGroups)
      .set({
        name: input.name !== undefined ? cleanName(input.name, group.name, 'Group name', 80) : group.name,
        color: input.color !== undefined ? cleanColor(input.color, 'blue') : group.color,
      })
      .where(eq(ticketGroups.id, groupId))
      .returning();
    await this.touchBoard(group.boardId);
    return this.toGroup(row);
  }

  /** Tickets in the deleted group move to the end of `moveToGroupId` (or the first other group). */
  async removeGroup(userId: string, groupId: string, moveToGroupId?: string): Promise<TicketBoardView> {
    const group = await this.requireGroup(userId, groupId);
    const siblings = await this.database
      .select()
      .from(ticketGroups)
      .where(and(eq(ticketGroups.boardId, group.boardId), ne(ticketGroups.id, groupId)))
      .orderBy(asc(ticketGroups.position));
    if (siblings.length === 0) {
      throw new HttpError('A board needs at least one group', 400, 'LAST_GROUP');
    }
    const target = moveToGroupId ? siblings.find((item) => item.id === moveToGroupId) : siblings[0];
    if (!target) {
      throw new HttpError('Group not found', 404, 'GROUP_NOT_FOUND');
    }
    await this.database.transaction(async (tx) => {
      const [{ nextPos }] = await tx
        .select({ nextPos: max(tickets.position) })
        .from(tickets)
        .where(eq(tickets.groupId, target.id));
      await tx
        .update(tickets)
        .set({ groupId: target.id, position: sql`${(nextPos ?? -1) + 1} + ${tickets.position}` })
        .where(eq(tickets.groupId, groupId));
      await tx.delete(ticketGroups).where(eq(ticketGroups.id, groupId));
    });
    return this.boardView(await this.boardRow(group.boardId));
  }

  async orderGroups(userId: string, boardId: string, groupIds: string[]): Promise<PublicTicketGroup[]> {
    await this.requireBoard(userId, boardId, true);
    await this.applyOrder(ticketGroups, boardId, groupIds);
    return (await this.groupsFor(boardId)).map((row) => this.toGroup(row));
  }

  // ---------- tickets ----------

  async createTicket(userId: string, boardId: string, input: TicketInput & { title: string }): Promise<PublicTicket> {
    const board = await this.requireBoard(userId, boardId, true);
    const title = cleanTitle(input.title);
    const statuses = await this.statusesFor(boardId);
    const groups = await this.groupsFor(boardId);
    const status = input.statusId ? statuses.find((item) => item.id === input.statusId) : statuses[0];
    const group = input.groupId ? groups.find((item) => item.id === input.groupId) : groups[0];
    if (!status) throw new HttpError('Status not found', 404, 'STATUS_NOT_FOUND');
    if (!group) throw new HttpError('Group not found', 404, 'GROUP_NOT_FOUND');
    const labels = cleanLabels(input.labels ?? []);
    const description = input.description ?? '';
    const assigneeIds = [...new Set(input.assigneeIds ?? [])];
    await this.assertAssignable(board.workspaceId, assigneeIds);

    const id = await this.database.transaction(async (tx) => {
      const [{ number }] = await tx
        .update(ticketBoards)
        .set({ nextNumber: sql`${ticketBoards.nextNumber} + 1`, updatedAt: new Date() })
        .where(eq(ticketBoards.id, boardId))
        .returning({ number: sql<number>`${ticketBoards.nextNumber} - 1` });
      const [{ groupPos }] = await tx
        .select({ groupPos: max(tickets.position) })
        .from(tickets)
        .where(eq(tickets.groupId, group.id));
      const [{ statusPos }] = await tx
        .select({ statusPos: max(tickets.statusPosition) })
        .from(tickets)
        .where(eq(tickets.statusId, status.id));
      const [row] = await tx
        .insert(tickets)
        .values({
          boardId,
          groupId: group.id,
          statusId: status.id,
          number: Number(number),
          title,
          description,
          priority: input.priority ?? 'none',
          dueDate: input.dueDate ?? null,
          labels,
          position: (groupPos ?? -1) + 1,
          statusPosition: (statusPos ?? -1) + 1,
          createdBy: userId,
          searchText: this.searchTextFor(description, labels),
        })
        .returning({ id: tickets.id });
      if (assigneeIds.length > 0) {
        await tx.insert(ticketAssignees).values(assigneeIds.map((assignee) => ({ ticketId: row.id, userId: assignee })));
      }
      await tx.insert(ticketActivity).values({ ticketId: row.id, actorId: userId, type: 'created', data: {} });
      return row.id;
    });
    return this.publicTicket(id, board);
  }

  async getTicket(userId: string, ticketId: string): Promise<TicketDetail> {
    const { ticket, board } = await this.requireTicket(userId, ticketId, false);
    return this.detail(userId, ticket, board);
  }

  async getTicketByKey(userId: string, workspaceId: string, rawKey: string): Promise<TicketDetail> {
    const workspace = await this.auth.requireMember(userId, workspaceId);
    this.assertNotEncrypted(workspace);
    const found = await this.findByKey(workspaceId, rawKey);
    if (!found) {
      throw new HttpError('Ticket not found', 404, 'TICKET_NOT_FOUND');
    }
    return this.detail(userId, found.ticket, found.board);
  }

  async patchTicket(userId: string, ticketId: string, input: TicketInput): Promise<PublicTicket> {
    const { ticket, board } = await this.requireTicket(userId, ticketId, true);
    const changes: Partial<typeof tickets.$inferInsert> = { updatedAt: new Date() };
    const activity: { type: string; data: Record<string, unknown> }[] = [];

    if (input.title !== undefined) {
      const title = cleanTitle(input.title);
      if (title !== ticket.title) {
        changes.title = title;
        activity.push({ type: 'title', data: { from: ticket.title, to: title } });
      }
    }
    if (input.description !== undefined) changes.description = input.description;
    if (input.labels !== undefined) changes.labels = cleanLabels(input.labels);
    if (input.description !== undefined || input.labels !== undefined) {
      changes.searchText = this.searchTextFor(
        changes.description ?? ticket.description,
        changes.labels ?? ticket.labels
      );
    }
    if (input.priority !== undefined && input.priority !== ticket.priority) {
      changes.priority = input.priority;
      activity.push({ type: 'priority', data: { from: ticket.priority, to: input.priority } });
    }
    if (input.dueDate !== undefined && input.dueDate !== ticket.dueDate) {
      changes.dueDate = input.dueDate;
      activity.push({ type: 'due', data: { from: ticket.dueDate, to: input.dueDate } });
    }
    if (input.statusId !== undefined && input.statusId !== ticket.statusId) {
      const [from, to] = await Promise.all([
        this.statusOnBoard(board.id, ticket.statusId),
        this.statusOnBoard(board.id, input.statusId),
      ]);
      changes.statusId = to.id;
      changes.statusPosition = await this.nextPosition(tickets.statusPosition, eq(tickets.statusId, to.id));
      activity.push({ type: 'status', data: { from: from.name, to: to.name } });
    }
    if (input.groupId !== undefined && input.groupId !== ticket.groupId) {
      const [from, to] = await Promise.all([
        this.groupOnBoard(board.id, ticket.groupId),
        this.groupOnBoard(board.id, input.groupId),
      ]);
      changes.groupId = to.id;
      changes.position = await this.nextPosition(tickets.position, eq(tickets.groupId, to.id));
      activity.push({ type: 'group', data: { from: from.name, to: to.name } });
    }

    let assigneeDelta: { added: string[]; removed: string[] } | null = null;
    if (input.assigneeIds !== undefined) {
      const next = [...new Set(input.assigneeIds)];
      const current = await this.assigneesFor([ticketId]);
      const before = current.get(ticketId) ?? [];
      if (!sameIds(before, next)) {
        await this.assertAssignable(board.workspaceId, next);
        assigneeDelta = {
          added: next.filter((id) => !before.includes(id)),
          removed: before.filter((id) => !next.includes(id)),
        };
        activity.push({ type: 'assignees', data: assigneeDelta });
      }
    }

    await this.database.transaction(async (tx) => {
      await tx.update(tickets).set(changes).where(eq(tickets.id, ticketId));
      if (assigneeDelta) {
        if (assigneeDelta.removed.length > 0) {
          await tx
            .delete(ticketAssignees)
            .where(and(eq(ticketAssignees.ticketId, ticketId), inArray(ticketAssignees.userId, assigneeDelta.removed)));
        }
        if (assigneeDelta.added.length > 0) {
          await tx.insert(ticketAssignees).values(assigneeDelta.added.map((id) => ({ ticketId, userId: id })));
        }
      }
      if (activity.length > 0) {
        await tx.insert(ticketActivity).values(activity.map((entry) => ({ ...entry, ticketId, actorId: userId })));
      }
    });
    return this.publicTicket(ticketId, board);
  }

  /**
   * Drag-and-drop. `groupId`/`position` place the ticket in the table view;
   * `statusId`/`statusPosition` place it in the kanban view. Either pair can be
   * sent alone. Positions are indexes in the destination list.
   */
  async moveTicket(
    userId: string,
    ticketId: string,
    input: { groupId?: string; position?: number; statusId?: string; statusPosition?: number }
  ): Promise<TicketBoardView> {
    const { ticket, board } = await this.requireTicket(userId, ticketId, true);
    const moveInGroups = input.groupId !== undefined || input.position !== undefined;
    const moveInStatuses = input.statusId !== undefined || input.statusPosition !== undefined;
    if (!moveInGroups && !moveInStatuses) {
      throw new HttpError('Nothing to move', 400, 'INVALID_MOVE');
    }
    const targetGroup = input.groupId ? await this.groupOnBoard(board.id, input.groupId) : null;
    const targetStatus = input.statusId ? await this.statusOnBoard(board.id, input.statusId) : null;
    const activity: { type: string; data: Record<string, unknown> }[] = [];
    if (targetGroup && targetGroup.id !== ticket.groupId) {
      const from = await this.groupOnBoard(board.id, ticket.groupId);
      activity.push({ type: 'group', data: { from: from.name, to: targetGroup.name } });
    }
    if (targetStatus && targetStatus.id !== ticket.statusId) {
      const from = await this.statusOnBoard(board.id, ticket.statusId);
      activity.push({ type: 'status', data: { from: from.name, to: targetStatus.name } });
    }

    const live = await this.database
      .select({
        id: tickets.id,
        groupId: tickets.groupId,
        statusId: tickets.statusId,
        position: tickets.position,
        statusPosition: tickets.statusPosition,
      })
      .from(tickets)
      .where(and(eq(tickets.boardId, board.id), isNull(tickets.deletedAt)));

    await this.database.transaction(async (tx) => {
      if (moveInGroups) {
        const { source, destination, sameContainer } = reorder(
          live,
          ticketId,
          (item) => item.groupId,
          (item) => item.position,
          targetGroup?.id ?? ticket.groupId,
          input.position
        );
        const groupId = targetGroup?.id ?? ticket.groupId;
        for (const list of sameContainer ? [destination] : [source, destination]) {
          for (const [position, item] of list.entries()) {
            const patch = item.id === ticketId ? { position, groupId } : { position };
            await tx.update(tickets).set(patch).where(eq(tickets.id, item.id));
          }
        }
      }
      if (moveInStatuses) {
        const { source, destination, sameContainer } = reorder(
          live,
          ticketId,
          (item) => item.statusId,
          (item) => item.statusPosition,
          targetStatus?.id ?? ticket.statusId,
          input.statusPosition
        );
        const statusId = targetStatus?.id ?? ticket.statusId;
        for (const list of sameContainer ? [destination] : [source, destination]) {
          for (const [statusPosition, item] of list.entries()) {
            const patch = item.id === ticketId ? { statusPosition, statusId } : { statusPosition };
            await tx.update(tickets).set(patch).where(eq(tickets.id, item.id));
          }
        }
      }
      await tx.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, ticketId));
      if (activity.length > 0) {
        await tx.insert(ticketActivity).values(activity.map((entry) => ({ ...entry, ticketId, actorId: userId })));
      }
    });
    return this.boardView(board);
  }

  async removeTicket(userId: string, ticketId: string): Promise<void> {
    await this.requireTicket(userId, ticketId, true);
    await this.database
      .update(tickets)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(tickets.id, ticketId));
  }

  async search(userId: string, workspaceId: string, filter: TicketSearchFilter): Promise<TicketSearchResult[]> {
    const workspace = await this.auth.requireMember(userId, workspaceId);
    this.assertNotEncrypted(workspace);
    const conditions: (SQL | undefined)[] = [
      eq(ticketBoards.workspaceId, workspaceId),
      isNull(ticketBoards.deletedAt),
      isNull(tickets.deletedAt),
    ];
    if (filter.boardId) conditions.push(eq(tickets.boardId, filter.boardId));
    if (filter.state === 'open') conditions.push(ne(ticketStatuses.category, 'done'));
    else if (filter.state) conditions.push(eq(ticketStatuses.category, filter.state));
    if (filter.assigneeId) {
      conditions.push(
        sql`exists (select 1 from ticket_assignees ta where ta.ticket_id = ${tickets.id} and ta.user_id = ${filter.assigneeId})`
      );
    }
    if (filter.q) {
      const key = parseTicketKey(filter.q);
      const parsed = normalizeDocsSearchQuery(filter.q);
      conditions.push(
        or(
          parsed ? ilike(tickets.title, `%${parsed.raw}%`) : undefined,
          parsed ? sql`tickets.search_tsv @@ plainto_tsquery('english', ${parsed.fts})` : undefined,
          key ? and(eq(ticketBoards.key, key.key), eq(tickets.number, key.number)) : undefined
        )
      );
    }
    const rows = await this.database
      .select({
        ticket: tickets,
        board: ticketBoards,
        statusName: ticketStatuses.name,
        statusColor: ticketStatuses.color,
        statusCategory: ticketStatuses.category,
      })
      .from(tickets)
      .innerJoin(ticketBoards, eq(tickets.boardId, ticketBoards.id))
      .innerJoin(ticketStatuses, eq(tickets.statusId, ticketStatuses.id))
      .where(and(...conditions))
      .orderBy(sql`${tickets.dueDate} asc nulls last`, desc(tickets.updatedAt))
      .limit(Math.min(filter.limit ?? MAX_SEARCH_RESULTS, MAX_SEARCH_RESULTS));
    const assignees = await this.assigneesFor(rows.map((row) => row.ticket.id));
    return rows.map((row) => ({
      ...this.toTicket(row.ticket, row.board.key, assignees.get(row.ticket.id)),
      boardName: row.board.name,
      statusName: row.statusName,
      statusColor: row.statusColor,
      statusCategory: asCategory(row.statusCategory),
    }));
  }

  // ---------- comments & activity ----------

  async listComments(userId: string, ticketId: string): Promise<PublicTicketComment[]> {
    const { ticket, board } = await this.requireTicket(userId, ticketId, false);
    const workspace = await this.auth.requireMember(userId, board.workspaceId);
    return this.commentsFor(ticket.id, userId, workspace);
  }

  async addComment(userId: string, ticketId: string, body: string): Promise<PublicTicketComment> {
    const { ticket, board } = await this.requireTicket(userId, ticketId, true);
    const text = this.cleanCommentBody(body);
    const [row] = await this.database
      .insert(ticketComments)
      .values({ ticketId: ticket.id, authorId: userId, body: text })
      .returning({ id: ticketComments.id });
    await this.database.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, ticket.id));
    return this.commentById(row.id, userId, await this.auth.requireMember(userId, board.workspaceId));
  }

  async patchComment(userId: string, commentId: string, body: string): Promise<PublicTicketComment> {
    const comment = await this.requireComment(userId, commentId);
    if (comment.authorId !== userId) {
      throw new HttpError('Only the author can edit this comment', 403, 'FORBIDDEN');
    }
    await this.database
      .update(ticketComments)
      .set({ body: this.cleanCommentBody(body), updatedAt: new Date() })
      .where(eq(ticketComments.id, commentId));
    return this.commentById(commentId, userId, comment.workspace);
  }

  async removeComment(userId: string, commentId: string): Promise<void> {
    const comment = await this.requireComment(userId, commentId);
    if (comment.authorId !== userId && !canAdminMembers(comment.workspace.role)) {
      throw new HttpError('Only the author or a workspace owner can delete this comment', 403, 'FORBIDDEN');
    }
    await this.database
      .update(ticketComments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(ticketComments.id, commentId));
  }

  async listActivity(userId: string, ticketId: string): Promise<PublicTicketActivity[]> {
    const { ticket } = await this.requireTicket(userId, ticketId, false);
    return this.activityFor(ticket.id);
  }

  // ---------- lookups used by MCP ----------

  async findBoardByKey(userId: string, workspaceId: string, rawKey: string): Promise<TicketBoardView> {
    const workspace = await this.auth.requireMember(userId, workspaceId);
    this.assertNotEncrypted(workspace);
    const key = rawKey.trim().toUpperCase();
    const [row] = await this.database
      .select()
      .from(ticketBoards)
      .where(and(eq(ticketBoards.workspaceId, workspaceId), eq(ticketBoards.key, key), isNull(ticketBoards.deletedAt)))
      .limit(1);
    if (!row) {
      throw new HttpError(`No ticket board with key ${key}`, 404, 'BOARD_NOT_FOUND');
    }
    return this.boardView(row);
  }

  /** Members of a workspace the caller belongs to, for resolving assignee emails and names. */
  async members(userId: string, workspaceId: string): Promise<{ userId: string; email: string; name: string | null }[]> {
    await this.auth.requireMember(userId, workspaceId);
    return this.database
      .select({ userId: users.id, email: users.email, name: users.name })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, workspaceId));
  }

  // ---------- internals ----------

  private async findByKey(workspaceId: string, rawKey: string): Promise<{ ticket: TicketRow; board: BoardRow } | null> {
    const parsed = parseTicketKey(rawKey);
    if (!parsed) return null;
    const [row] = await this.database
      .select({ ticket: tickets, board: ticketBoards })
      .from(tickets)
      .innerJoin(ticketBoards, eq(tickets.boardId, ticketBoards.id))
      .where(
        and(
          eq(ticketBoards.workspaceId, workspaceId),
          eq(ticketBoards.key, parsed.key),
          isNull(ticketBoards.deletedAt),
          eq(tickets.number, parsed.number),
          isNull(tickets.deletedAt)
        )
      )
      .limit(1);
    return row ?? null;
  }

  private async detail(userId: string, ticket: TicketRow, board: BoardRow): Promise<TicketDetail> {
    const workspace = await this.auth.requireMember(userId, board.workspaceId);
    const [status, group, assignees, comments, activity, counts] = await Promise.all([
      this.statusOnBoard(board.id, ticket.statusId),
      this.groupOnBoard(board.id, ticket.groupId),
      this.assigneesFor([ticket.id]),
      this.commentsFor(ticket.id, userId, workspace),
      this.activityFor(ticket.id),
      this.boardCounts([board.id]),
    ]);
    return {
      ticket: this.toTicket(ticket, board.key, assignees.get(ticket.id)),
      board: this.toBoard(board, counts.get(board.id)),
      status: this.toStatus(status),
      group: this.toGroup(group),
      comments,
      activity,
    };
  }

  private async boardView(board: BoardRow): Promise<TicketBoardView> {
    const [fresh] = await this.database.select().from(ticketBoards).where(eq(ticketBoards.id, board.id)).limit(1);
    const [statuses, groups, rows] = await Promise.all([
      this.statusesFor(board.id),
      this.groupsFor(board.id),
      this.database
        .select()
        .from(tickets)
        .where(and(eq(tickets.boardId, board.id), isNull(tickets.deletedAt)))
        .orderBy(asc(tickets.position), asc(tickets.number)),
    ]);
    const assignees = await this.assigneesFor(rows.map((row) => row.id));
    const doneIds = new Set(statuses.filter((status) => status.category === 'done').map((status) => status.id));
    const current = fresh ?? board;
    return {
      board: this.toBoard(current, {
        ticketCount: rows.length,
        openCount: rows.filter((row) => !doneIds.has(row.statusId)).length,
      }),
      statuses: statuses.map((row) => this.toStatus(row)),
      groups: groups.map((row) => this.toGroup(row)),
      tickets: rows.map((row) => this.toTicket(row, current.key, assignees.get(row.id))),
    };
  }

  private async publicTicket(ticketId: string, board: BoardRow): Promise<PublicTicket> {
    const [row] = await this.database.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    const assignees = await this.assigneesFor([ticketId]);
    return this.toTicket(row, board.key, assignees.get(ticketId));
  }

  private async requireBoard(userId: string, boardId: string, write: boolean): Promise<BoardRow> {
    const row = UUID_RE.test(boardId)
      ? (await this.database.select().from(ticketBoards).where(eq(ticketBoards.id, boardId)).limit(1))[0]
      : undefined;
    if (!row || row.deletedAt) {
      throw new HttpError('Board not found', 404, 'BOARD_NOT_FOUND');
    }
    const workspace = write
      ? await this.auth.requireEditor(userId, row.workspaceId)
      : await this.auth.requireMember(userId, row.workspaceId);
    this.assertNotEncrypted(workspace);
    return row;
  }

  private async requireTicket(
    userId: string,
    ticketId: string,
    write: boolean
  ): Promise<{ ticket: TicketRow; board: BoardRow }> {
    const ticket = UUID_RE.test(ticketId)
      ? (await this.database.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1))[0]
      : undefined;
    if (!ticket || ticket.deletedAt) {
      throw new HttpError('Ticket not found', 404, 'TICKET_NOT_FOUND');
    }
    const board = await this.requireBoard(userId, ticket.boardId, write);
    return { ticket, board };
  }

  private async requireStatus(userId: string, statusId: string): Promise<StatusRow> {
    const row = UUID_RE.test(statusId)
      ? (await this.database.select().from(ticketStatuses).where(eq(ticketStatuses.id, statusId)).limit(1))[0]
      : undefined;
    if (!row) {
      throw new HttpError('Status not found', 404, 'STATUS_NOT_FOUND');
    }
    await this.requireBoard(userId, row.boardId, true);
    return row;
  }

  private async requireGroup(userId: string, groupId: string): Promise<GroupRow> {
    const row = UUID_RE.test(groupId)
      ? (await this.database.select().from(ticketGroups).where(eq(ticketGroups.id, groupId)).limit(1))[0]
      : undefined;
    if (!row) {
      throw new HttpError('Group not found', 404, 'GROUP_NOT_FOUND');
    }
    await this.requireBoard(userId, row.boardId, true);
    return row;
  }

  /** Comment writes need an editor; the caller decides author/owner rules. */
  private async requireComment(userId: string, commentId: string) {
    const row = UUID_RE.test(commentId)
      ? (await this.database.select().from(ticketComments).where(eq(ticketComments.id, commentId)).limit(1))[0]
      : undefined;
    if (!row || row.deletedAt) {
      throw new HttpError('Comment not found', 404, 'COMMENT_NOT_FOUND');
    }
    const { board } = await this.requireTicket(userId, row.ticketId, true);
    const workspace = await this.auth.requireMember(userId, board.workspaceId);
    return { ...row, workspace };
  }

  private async statusOnBoard(boardId: string, statusId: string): Promise<StatusRow> {
    const row = UUID_RE.test(statusId)
      ? (
          await this.database
            .select()
            .from(ticketStatuses)
            .where(and(eq(ticketStatuses.id, statusId), eq(ticketStatuses.boardId, boardId)))
            .limit(1)
        )[0]
      : undefined;
    if (!row) throw new HttpError('Status not found', 404, 'STATUS_NOT_FOUND');
    return row;
  }

  private async groupOnBoard(boardId: string, groupId: string): Promise<GroupRow> {
    const row = UUID_RE.test(groupId)
      ? (
          await this.database
            .select()
            .from(ticketGroups)
            .where(and(eq(ticketGroups.id, groupId), eq(ticketGroups.boardId, boardId)))
            .limit(1)
        )[0]
      : undefined;
    if (!row) throw new HttpError('Group not found', 404, 'GROUP_NOT_FOUND');
    return row;
  }

  private async boardRow(boardId: string): Promise<BoardRow> {
    const [row] = await this.database.select().from(ticketBoards).where(eq(ticketBoards.id, boardId)).limit(1);
    return row;
  }

  private statusesFor(boardId: string): Promise<StatusRow[]> {
    return this.database
      .select()
      .from(ticketStatuses)
      .where(eq(ticketStatuses.boardId, boardId))
      .orderBy(asc(ticketStatuses.position));
  }

  private groupsFor(boardId: string): Promise<GroupRow[]> {
    return this.database
      .select()
      .from(ticketGroups)
      .where(eq(ticketGroups.boardId, boardId))
      .orderBy(asc(ticketGroups.position));
  }

  private async applyOrder(table: typeof ticketStatuses | typeof ticketGroups, boardId: string, ids: string[]) {
    const rows = await this.database.select({ id: table.id }).from(table).where(eq(table.boardId, boardId));
    const existing = new Set(rows.map((row) => row.id));
    if (ids.length !== existing.size || new Set(ids).size !== ids.length || ids.some((id) => !existing.has(id))) {
      throw new HttpError('Order must list every item once', 400, 'INVALID_ORDER');
    }
    await this.database.transaction(async (tx) => {
      for (const [position, id] of ids.entries()) {
        await tx.update(table).set({ position }).where(eq(table.id, id));
      }
    });
    await this.touchBoard(boardId);
  }

  private async nextPosition(column: typeof tickets.position | typeof tickets.statusPosition, where: SQL) {
    const [{ value }] = await this.database.select({ value: max(column) }).from(tickets).where(where);
    return (value ?? -1) + 1;
  }

  private async liveTicketCount(where: SQL): Promise<number> {
    const [{ value }] = await this.database
      .select({ value: sql<number>`count(*)`.mapWith(Number) })
      .from(tickets)
      .where(and(where, isNull(tickets.deletedAt)));
    return value;
  }

  private async assertAssignable(workspaceId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    if (userIds.some((id) => !UUID_RE.test(id))) {
      throw new HttpError('Assignees must be workspace members', 400, 'INVALID_ASSIGNEE');
    }
    const rows = await this.database
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(workspaceMembers.userId, userIds)));
    if (rows.length !== new Set(userIds).size) {
      throw new HttpError('Assignees must be workspace members', 400, 'INVALID_ASSIGNEE');
    }
  }

  private async assigneesFor(ticketIds: string[], executor: Executor = this.database) {
    const map = new Map<string, string[]>();
    if (ticketIds.length === 0) return map;
    const rows = await executor
      .select({ ticketId: ticketAssignees.ticketId, userId: ticketAssignees.userId })
      .from(ticketAssignees)
      .where(inArray(ticketAssignees.ticketId, ticketIds))
      .orderBy(asc(ticketAssignees.createdAt));
    for (const row of rows) {
      const list = map.get(row.ticketId) ?? [];
      list.push(row.userId);
      map.set(row.ticketId, list);
    }
    return map;
  }

  private async boardCounts(boardIds: string[]) {
    const counts = new Map<string, { ticketCount: number; openCount: number }>();
    if (boardIds.length === 0) return counts;
    const rows = await this.database
      .select({
        boardId: tickets.boardId,
        ticketCount: sql<number>`count(*)`.mapWith(Number),
        openCount: sql<number>`count(*) filter (where ${ticketStatuses.category} <> 'done')`.mapWith(Number),
      })
      .from(tickets)
      .innerJoin(ticketStatuses, eq(tickets.statusId, ticketStatuses.id))
      .where(and(inArray(tickets.boardId, boardIds), isNull(tickets.deletedAt)))
      .groupBy(tickets.boardId);
    for (const row of rows) counts.set(row.boardId, { ticketCount: row.ticketCount, openCount: row.openCount });
    return counts;
  }

  private async commentsFor(ticketId: string, userId: string, workspace: PublicWorkspace) {
    const rows = await this.database
      .select({ comment: ticketComments, authorName: users.name, authorEmail: users.email })
      .from(ticketComments)
      .leftJoin(users, eq(ticketComments.authorId, users.id))
      .where(and(eq(ticketComments.ticketId, ticketId), isNull(ticketComments.deletedAt)))
      .orderBy(asc(ticketComments.createdAt));
    return rows.map((row) => this.toComment(row, userId, workspace));
  }

  private async commentById(commentId: string, userId: string, workspace: PublicWorkspace): Promise<PublicTicketComment> {
    const [row] = await this.database
      .select({ comment: ticketComments, authorName: users.name, authorEmail: users.email })
      .from(ticketComments)
      .leftJoin(users, eq(ticketComments.authorId, users.id))
      .where(eq(ticketComments.id, commentId))
      .limit(1);
    return this.toComment(row, userId, workspace);
  }

  private async activityFor(ticketId: string): Promise<PublicTicketActivity[]> {
    const rows = await this.database
      .select({ activity: ticketActivity, actorName: users.name, actorEmail: users.email })
      .from(ticketActivity)
      .leftJoin(users, eq(ticketActivity.actorId, users.id))
      .where(eq(ticketActivity.ticketId, ticketId))
      .orderBy(asc(ticketActivity.createdAt))
      .limit(500);
    return rows.map((row) => ({
      id: row.activity.id,
      ticketId: row.activity.ticketId,
      actorId: row.activity.actorId,
      actorName: row.actorName ?? row.actorEmail ?? null,
      type: row.activity.type,
      data: row.activity.data,
      createdAt: row.activity.createdAt,
    }));
  }

  private cleanCommentBody(raw: string): string {
    const body = raw.trim();
    if (!body || body.length > MAX_COMMENT_BODY) {
      throw new HttpError(`Comment must be 1–${MAX_COMMENT_BODY} characters`, 400, 'INVALID_COMMENT');
    }
    return body;
  }

  private searchTextFor(description: string, labels: string[]): string {
    return `${labels.join(' ')} ${description}`.slice(0, 20_000);
  }

  private async freeKey(workspaceId: string, base: string): Promise<string> {
    const rows = await this.database
      .select({ key: ticketBoards.key })
      .from(ticketBoards)
      .where(and(eq(ticketBoards.workspaceId, workspaceId), isNull(ticketBoards.deletedAt)));
    const taken = new Set(rows.map((row) => row.key));
    if (!taken.has(base)) return base;
    for (let suffix = 2; suffix < 1000; suffix += 1) {
      const candidate = `${base.slice(0, 10 - String(suffix).length)}${suffix}`;
      if (!taken.has(candidate)) return candidate;
    }
    return base;
  }

  private keyTaken(key: string): HttpError {
    return new HttpError(`Another board already uses the key ${key}`, 409, 'BOARD_KEY_TAKEN');
  }

  private async touchBoard(boardId: string): Promise<void> {
    await this.database.update(ticketBoards).set({ updatedAt: new Date() }).where(eq(ticketBoards.id, boardId));
  }

  private assertNotEncrypted(workspace: PublicWorkspace): void {
    if (workspace.encrypted) {
      throw new HttpError('Tickets are not available in encrypted workspaces yet', 409, 'TICKETS_ENCRYPTION_PENDING');
    }
  }

  private toBoard(row: BoardRow, counts = { ticketCount: 0, openCount: 0 }): PublicTicketBoard {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      key: row.key,
      name: row.name,
      description: row.description,
      position: row.position,
      ticketCount: counts.ticketCount,
      openCount: counts.openCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toStatus(row: StatusRow): PublicTicketStatus {
    return {
      id: row.id,
      boardId: row.boardId,
      name: row.name,
      color: row.color,
      category: asCategory(row.category),
      position: row.position,
    };
  }

  private toGroup(row: GroupRow): PublicTicketGroup {
    return { id: row.id, boardId: row.boardId, name: row.name, color: row.color, position: row.position };
  }

  private toTicket(row: TicketRow, boardKey: string, assigneeIds: string[] = []): PublicTicket {
    return {
      id: row.id,
      boardId: row.boardId,
      key: `${boardKey}-${row.number}`,
      number: row.number,
      groupId: row.groupId,
      statusId: row.statusId,
      title: row.title,
      description: row.description,
      priority: asPriority(row.priority),
      dueDate: row.dueDate,
      labels: row.labels,
      position: row.position,
      statusPosition: row.statusPosition,
      assigneeIds,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toComment(
    row: { comment: typeof ticketComments.$inferSelect; authorName: string | null; authorEmail: string | null },
    userId: string,
    workspace: PublicWorkspace
  ): PublicTicketComment {
    const own = row.comment.authorId === userId;
    return {
      id: row.comment.id,
      ticketId: row.comment.ticketId,
      authorId: row.comment.authorId,
      authorName: row.authorName ?? row.authorEmail ?? null,
      body: row.comment.body,
      editable: own,
      deletable: own || canAdminMembers(workspace.role),
      createdAt: row.comment.createdAt,
      updatedAt: row.comment.updatedAt,
    };
  }
}
