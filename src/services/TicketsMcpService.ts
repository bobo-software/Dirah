import { HttpError } from '../utils/HttpError';
import type { DocsMcpService } from './DocsMcpService';
import {
  type PublicTicket,
  type PublicTicketGroup,
  type PublicTicketStatus,
  type TicketBoardView,
  type TicketPriority,
  type TicketService,
  type TicketStatusCategory,
} from './TicketService';

type Member = { userId: string; email: string; name: string | null };

export interface TicketRow {
  key: string;
  title: string;
  status: string;
  group: string;
  priority: TicketPriority;
  assignees: string[];
  dueDate: string | null;
  labels: string[];
  url: string;
}

export interface TicketReadResult extends TicketRow {
  board: { key: string; name: string };
  description: string;
  comments: { id: string; author: string | null; body: string; createdAt: Date }[];
  activity: { actor: string | null; type: string; data: Record<string, unknown>; createdAt: Date }[];
  createdAt: Date;
  updatedAt: Date;
}

export type TicketSearchRow = Omit<TicketRow, 'group'> & { board: string };

interface Scope {
  workspaceRef?: string;
  defaultWorkspaceId?: string | null;
  /** Told the resolved workspace, so the tool's audit row can record it. */
  onWorkspace?: (workspaceId: string) => void;
}

export interface StatusInput extends Scope {
  board: string;
  name: string;
  rename?: string;
  color?: string;
  category?: TicketStatusCategory;
  position?: number;
}

export interface GroupInput extends Scope {
  board: string;
  name: string;
  rename?: string;
  color?: string;
  position?: number;
}

export interface TicketWriteInput extends Scope {
  title?: string;
  description?: string;
  status?: string;
  group?: string;
  priority?: TicketPriority;
  assignees?: string[];
  dueDate?: string | null;
  labels?: string[];
}

const MAX_ACTIVITY = 20;

/**
 * MCP face of tickets. Agents refer to boards by key (DIRA), tickets by key
 * (DIRA-12), statuses and groups by name, and people by email — never UUIDs.
 */
export class TicketsMcpService {
  constructor(
    private readonly tickets: TicketService,
    private readonly docs: DocsMcpService,
    private readonly options: { appPublicUrl?: string } = {}
  ) {}

  recordAudit(entry: Parameters<DocsMcpService['recordAudit']>[0]): Promise<void> {
    return this.docs.recordAudit(entry);
  }

  ticketUrl(workspaceId: string, boardId: string, key: string): string {
    const origin = (this.options.appPublicUrl ?? '').replace(/\/$/, '') || 'http://localhost:5181';
    return `${origin}/w/${workspaceId}/tickets/${boardId}?ticket=${encodeURIComponent(key)}`;
  }

  async listBoards(userId: string, tokenId: string | null, scope: Scope) {
    const workspaceId = await this.workspace(userId, tokenId, scope, false);
    const boards = await this.tickets.listBoards(userId, workspaceId);
    return boards.map((board) => ({
      key: board.key,
      name: board.name,
      description: board.description,
      ticketCount: board.ticketCount,
      openCount: board.openCount,
    }));
  }

  async readBoard(userId: string, tokenId: string | null, input: Scope & { board: string; state?: 'open' | 'all' }) {
    const workspaceId = await this.workspace(userId, tokenId, input, false);
    const view = await this.tickets.findBoardByKey(userId, workspaceId, input.board);
    const members = await this.tickets.members(userId, workspaceId);
    const doneIds = new Set(view.statuses.filter((status) => status.category === 'done').map((status) => status.id));
    const tickets = input.state === 'all' ? view.tickets : view.tickets.filter((ticket) => !doneIds.has(ticket.statusId));
    return {
      board: { key: view.board.key, name: view.board.name, description: view.board.description },
      statuses: view.statuses.map((status) => ({ name: status.name, category: status.category })),
      groups: view.groups.map((group) => group.name),
      tickets: tickets.map((ticket) => this.toRow(workspaceId, ticket, view.statuses, view.groups, members)),
    };
  }

  async search(
    userId: string,
    tokenId: string | null,
    input: Scope & {
      q?: string;
      board?: string;
      status?: string;
      assignee?: string;
      state?: TicketStatusCategory | 'open';
      limit?: number;
    }
  ): Promise<TicketSearchRow[]> {
    const workspaceId = await this.workspace(userId, tokenId, input, false);
    const members = await this.tickets.members(userId, workspaceId);
    const boardId = input.board ? (await this.tickets.findBoardByKey(userId, workspaceId, input.board)).board.id : undefined;
    const assigneeId = input.assignee
      ? input.assignee.trim().toLowerCase() === 'me'
        ? userId
        : this.memberIds(members, [input.assignee])[0]
      : undefined;
    const results = await this.tickets.search(userId, workspaceId, {
      q: input.q,
      boardId,
      assigneeId,
      state: input.state,
      statusName: input.status,
      limit: input.limit,
    });
    return results.map((ticket) => ({
      key: ticket.key,
      title: ticket.title,
      status: ticket.statusName,
      priority: ticket.priority,
      assignees: this.memberLabels(members, ticket.assigneeIds),
      dueDate: ticket.dueDate,
      labels: ticket.labels,
      board: ticket.boardName,
      url: this.ticketUrl(workspaceId, ticket.boardId, ticket.key),
    }));
  }

  async readTicket(userId: string, tokenId: string | null, input: Scope & { key: string }): Promise<TicketReadResult> {
    const workspaceId = await this.workspace(userId, tokenId, input, false);
    return this.read(userId, workspaceId, input.key);
  }

  async createTicket(
    userId: string,
    tokenId: string | null,
    input: TicketWriteInput & { board: string; title: string }
  ): Promise<TicketReadResult> {
    const workspaceId = await this.workspace(userId, tokenId, input, true);
    const view = await this.tickets.findBoardByKey(userId, workspaceId, input.board);
    const members = await this.tickets.members(userId, workspaceId);
    const ticket = await this.tickets.createTicket(userId, view.board.id, {
      title: input.title,
      description: input.description,
      statusId: input.status ? this.pick(view.statuses, input.status, 'status').id : undefined,
      groupId: input.group ? this.pick(view.groups, input.group, 'group').id : undefined,
      priority: input.priority,
      dueDate: input.dueDate,
      labels: input.labels,
      assigneeIds: input.assignees ? this.memberIds(members, input.assignees) : undefined,
    });
    return this.read(userId, workspaceId, ticket.key);
  }

  async updateTicket(
    userId: string,
    tokenId: string | null,
    input: TicketWriteInput & { key: string }
  ): Promise<TicketReadResult> {
    const workspaceId = await this.workspace(userId, tokenId, input, true);
    const detail = await this.tickets.getTicketByKey(userId, workspaceId, input.key);
    const needsBoard = input.status !== undefined || input.group !== undefined;
    const view = needsBoard ? await this.tickets.getBoard(userId, detail.board.id) : null;
    const members = input.assignees ? await this.tickets.members(userId, workspaceId) : [];
    await this.tickets.patchTicket(userId, detail.ticket.id, {
      title: input.title,
      description: input.description,
      statusId: input.status !== undefined && view ? this.pick(view.statuses, input.status, 'status').id : undefined,
      groupId: input.group !== undefined && view ? this.pick(view.groups, input.group, 'group').id : undefined,
      priority: input.priority,
      dueDate: input.dueDate,
      labels: input.labels,
      assigneeIds: input.assignees ? this.memberIds(members, input.assignees) : undefined,
    });
    return this.read(userId, workspaceId, detail.ticket.key);
  }

  async comment(userId: string, tokenId: string | null, input: Scope & { key: string; body: string }) {
    const workspaceId = await this.workspace(userId, tokenId, input, true);
    const detail = await this.tickets.getTicketByKey(userId, workspaceId, input.key);
    const comment = await this.tickets.addComment(userId, detail.ticket.id, input.body);
    return {
      key: detail.ticket.key,
      comment: { id: comment.id, body: comment.body, createdAt: comment.createdAt },
      url: this.ticketUrl(workspaceId, detail.board.id, detail.ticket.key),
    };
  }

  // ---------- boards ----------

  async createBoard(
    userId: string,
    tokenId: string | null,
    input: Scope & { name: string; key?: string; description?: string | null }
  ) {
    const workspaceId = await this.workspace(userId, tokenId, input, true);
    const view = await this.tickets.createBoard(userId, workspaceId, {
      name: input.name,
      key: input.key,
      description: input.description,
    });
    return this.boardSummary(view);
  }

  async updateBoard(
    userId: string,
    tokenId: string | null,
    input: Scope & { board: string; name?: string; key?: string; description?: string | null }
  ) {
    const workspaceId = await this.workspace(userId, tokenId, input, true);
    const view = await this.tickets.findBoardByKey(userId, workspaceId, input.board);
    await this.tickets.patchBoard(userId, view.board.id, {
      name: input.name,
      key: input.key,
      description: input.description,
    });
    return this.boardSummary(await this.tickets.getBoard(userId, view.board.id));
  }

  async deleteBoard(userId: string, tokenId: string | null, input: Scope & { board: string }) {
    const workspaceId = await this.workspace(userId, tokenId, input, true);
    const view = await this.tickets.findBoardByKey(userId, workspaceId, input.board);
    await this.tickets.removeBoard(userId, view.board.id);
    return { deleted: view.board.key, tickets: view.tickets.length };
  }

  // ---------- statuses & groups ----------

  /** Create the status if the name is new, else update it. `position` is its 0-based place in the list. */
  async saveStatus(userId: string, tokenId: string | null, input: StatusInput) {
    const workspaceId = await this.workspace(userId, tokenId, input, true);
    const view = await this.tickets.findBoardByKey(userId, workspaceId, input.board);
    const existing = this.find(view.statuses, input.name);
    const status = existing
      ? await this.tickets.patchStatus(userId, existing.id, {
          name: input.rename,
          color: input.color,
          category: input.category,
        })
      : await this.tickets.createStatus(userId, view.board.id, {
          name: input.rename ?? input.name,
          color: input.color,
          category: input.category,
        });
    if (input.position !== undefined) {
      const ids = this.placed((await this.tickets.getBoard(userId, view.board.id)).statuses, status.id, input.position);
      await this.tickets.orderStatuses(userId, view.board.id, ids);
    }
    return this.boardSummary(await this.tickets.getBoard(userId, view.board.id));
  }

  async deleteStatus(
    userId: string,
    tokenId: string | null,
    input: Scope & { board: string; name: string; moveTo?: string }
  ) {
    const workspaceId = await this.workspace(userId, tokenId, input, true);
    const view = await this.tickets.findBoardByKey(userId, workspaceId, input.board);
    const status = this.pick(view.statuses, input.name, 'status');
    const moveTo = input.moveTo ? this.pick(view.statuses, input.moveTo, 'status').id : undefined;
    return this.boardSummary(await this.tickets.removeStatus(userId, status.id, moveTo));
  }

  /** Create the group if the name is new, else update it. `position` is its 0-based place in the list. */
  async saveGroup(userId: string, tokenId: string | null, input: GroupInput) {
    const workspaceId = await this.workspace(userId, tokenId, input, true);
    const view = await this.tickets.findBoardByKey(userId, workspaceId, input.board);
    const existing = this.find(view.groups, input.name);
    const group = existing
      ? await this.tickets.patchGroup(userId, existing.id, { name: input.rename, color: input.color })
      : await this.tickets.createGroup(userId, view.board.id, { name: input.rename ?? input.name, color: input.color });
    if (input.position !== undefined) {
      const ids = this.placed((await this.tickets.getBoard(userId, view.board.id)).groups, group.id, input.position);
      await this.tickets.orderGroups(userId, view.board.id, ids);
    }
    return this.boardSummary(await this.tickets.getBoard(userId, view.board.id));
  }

  async deleteGroup(
    userId: string,
    tokenId: string | null,
    input: Scope & { board: string; name: string; moveTo?: string }
  ) {
    const workspaceId = await this.workspace(userId, tokenId, input, true);
    const view = await this.tickets.findBoardByKey(userId, workspaceId, input.board);
    const group = this.pick(view.groups, input.name, 'group');
    const moveTo = input.moveTo ? this.pick(view.groups, input.moveTo, 'group').id : undefined;
    return this.boardSummary(await this.tickets.removeGroup(userId, group.id, moveTo));
  }

  // ---------- tickets ----------

  /**
   * Reorder a ticket. `status` + `statusPosition` place it in the kanban view;
   * `group` + `groupPosition` place it in the table view. Positions are 0-based
   * indexes in the destination list; omit one to append.
   */
  async moveTicket(
    userId: string,
    tokenId: string | null,
    input: Scope & { key: string; status?: string; statusPosition?: number; group?: string; groupPosition?: number }
  ): Promise<TicketReadResult> {
    const workspaceId = await this.workspace(userId, tokenId, input, true);
    const detail = await this.tickets.getTicketByKey(userId, workspaceId, input.key);
    const view = await this.tickets.getBoard(userId, detail.board.id);
    const statusId = input.status !== undefined ? this.pick(view.statuses, input.status, 'status').id : undefined;
    const groupId = input.group !== undefined ? this.pick(view.groups, input.group, 'group').id : undefined;
    const inStatuses = statusId !== undefined || input.statusPosition !== undefined;
    const inGroups = groupId !== undefined || input.groupPosition !== undefined;
    if (!inStatuses && !inGroups) {
      throw new HttpError('Pass status/statusPosition or group/groupPosition', 400, 'INVALID_MOVE');
    }
    await this.tickets.moveTicket(userId, detail.ticket.id, {
      ...(inStatuses ? { statusId, statusPosition: input.statusPosition } : {}),
      ...(inGroups ? { groupId, position: input.groupPosition } : {}),
    });
    return this.read(userId, workspaceId, detail.ticket.key);
  }

  async deleteTicket(userId: string, tokenId: string | null, input: Scope & { key: string }) {
    const workspaceId = await this.workspace(userId, tokenId, input, true);
    const detail = await this.tickets.getTicketByKey(userId, workspaceId, input.key);
    await this.tickets.removeTicket(userId, detail.ticket.id);
    return { deleted: detail.ticket.key };
  }

  // ---------- comments ----------

  async editComment(
    userId: string,
    tokenId: string | null,
    input: Scope & { key: string; commentId: string; body: string }
  ) {
    const { workspaceId, detail } = await this.commentOnTicket(userId, tokenId, input);
    const comment = await this.tickets.patchComment(userId, input.commentId, input.body);
    return {
      key: detail.ticket.key,
      comment: { id: comment.id, body: comment.body, updatedAt: comment.updatedAt },
      url: this.ticketUrl(workspaceId, detail.board.id, detail.ticket.key),
    };
  }

  async deleteComment(userId: string, tokenId: string | null, input: Scope & { key: string; commentId: string }) {
    const { detail } = await this.commentOnTicket(userId, tokenId, input);
    await this.tickets.removeComment(userId, input.commentId);
    return { key: detail.ticket.key, deleted: input.commentId };
  }

  /** The comment must belong to the ticket named by key, so ids can't reach across tickets. */
  private async commentOnTicket(userId: string, tokenId: string | null, input: Scope & { key: string; commentId: string }) {
    const workspaceId = await this.workspace(userId, tokenId, input, true);
    const detail = await this.tickets.getTicketByKey(userId, workspaceId, input.key);
    if (!detail.comments.some((comment) => comment.id === input.commentId)) {
      throw new HttpError(`Comment ${input.commentId} is not on ${detail.ticket.key}`, 404, 'COMMENT_NOT_FOUND');
    }
    return { workspaceId, detail };
  }

  private boardSummary(view: TicketBoardView) {
    return {
      board: {
        key: view.board.key,
        name: view.board.name,
        description: view.board.description,
        ticketCount: view.board.ticketCount,
        openCount: view.board.openCount,
      },
      statuses: [...view.statuses]
        .sort((a, b) => a.position - b.position)
        .map((status) => ({ name: status.name, category: status.category, color: status.color })),
      groups: [...view.groups].sort((a, b) => a.position - b.position).map((group) => ({ name: group.name, color: group.color })),
    };
  }

  private find<T extends { id: string; name: string }>(items: T[], ref: string): T | undefined {
    const wanted = ref.trim().toLowerCase();
    return items.find((item) => item.id === ref.trim()) ?? items.find((item) => item.name.toLowerCase() === wanted);
  }

  /** Ids in current order with `id` moved to `position` (clamped). */
  private placed(items: { id: string; position: number }[], id: string, position: number): string[] {
    const ids = [...items].sort((a, b) => a.position - b.position).map((item) => item.id).filter((item) => item !== id);
    ids.splice(Math.max(0, Math.min(position, ids.length)), 0, id);
    return ids;
  }

  private async read(userId: string, workspaceId: string, key: string): Promise<TicketReadResult> {
    const detail = await this.tickets.getTicketByKey(userId, workspaceId, key);
    const members = await this.tickets.members(userId, workspaceId);
    return {
      ...this.toRow(workspaceId, detail.ticket, [detail.status], [detail.group], members),
      board: { key: detail.board.key, name: detail.board.name },
      description: detail.ticket.description,
      comments: detail.comments.map((comment) => ({
        id: comment.id,
        author: comment.authorName,
        body: comment.body,
        createdAt: comment.createdAt,
      })),
      activity: detail.activity.slice(-MAX_ACTIVITY).map((entry) => ({
        actor: entry.actorName,
        type: entry.type,
        data: this.activityData(entry.type, entry.data, members),
        createdAt: entry.createdAt,
      })),
      createdAt: detail.ticket.createdAt,
      updatedAt: detail.ticket.updatedAt,
    };
  }

  private async workspace(userId: string, tokenId: string | null, scope: Scope, write: boolean): Promise<string> {
    const workspace = await this.docs.resolveWorkspace(userId, tokenId, scope.workspaceRef, {
      defaultWorkspaceId: scope.defaultWorkspaceId,
    });
    if (!workspace) {
      throw new HttpError('workspace or workspaceId is required', 400, 'WORKSPACE_REQUIRED');
    }
    scope.onWorkspace?.(workspace.workspaceId);
    await this.docs.requireWorkspaceAccess(userId, tokenId, workspace.workspaceId, write);
    return workspace.workspaceId;
  }

  /** Match by id or case-insensitive name; a miss lists the valid names. */
  private pick<T extends { id: string; name: string }>(items: T[], ref: string, label: 'status' | 'group'): T {
    const hit = this.find(items, ref);
    if (!hit) {
      throw new HttpError(
        `Unknown ${label} "${ref}". Use one of: ${items.map((item) => item.name).join(', ')}`,
        400,
        label === 'status' ? 'UNKNOWN_STATUS' : 'UNKNOWN_GROUP',
        { candidates: items.map((item) => item.name) }
      );
    }
    return hit;
  }

  private memberIds(members: Member[], refs: string[]): string[] {
    return refs.map((ref) => {
      const wanted = ref.trim().toLowerCase();
      const hit = members.find((member) => member.email.toLowerCase() === wanted || member.userId === ref.trim());
      if (!hit) {
        throw new HttpError(`${ref} is not a member of this workspace`, 400, 'INVALID_ASSIGNEE');
      }
      return hit.userId;
    });
  }

  private memberLabels(members: Member[], ids: string[]): string[] {
    return ids.map((id) => members.find((member) => member.userId === id)?.email ?? id);
  }

  private activityData(type: string, data: Record<string, unknown>, members: Member[]) {
    if (type !== 'assignees') return data;
    const labels = (value: unknown) => this.memberLabels(members, Array.isArray(value) ? (value as string[]) : []);
    return { added: labels(data.added), removed: labels(data.removed) };
  }

  private toRow(
    workspaceId: string,
    ticket: PublicTicket,
    statuses: PublicTicketStatus[],
    groups: PublicTicketGroup[],
    members: Member[]
  ): TicketRow {
    return {
      key: ticket.key,
      title: ticket.title,
      status: statuses.find((status) => status.id === ticket.statusId)?.name ?? '',
      group: groups.find((group) => group.id === ticket.groupId)?.name ?? '',
      priority: ticket.priority,
      assignees: this.memberLabels(members, ticket.assigneeIds),
      dueDate: ticket.dueDate,
      labels: ticket.labels,
      url: this.ticketUrl(workspaceId, ticket.boardId, ticket.key),
    };
  }
}
