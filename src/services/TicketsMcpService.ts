import { HttpError } from '../utils/HttpError';
import type { DocsMcpService } from './DocsMcpService';
import {
  type PublicTicket,
  type PublicTicketGroup,
  type PublicTicketStatus,
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
  comments: { author: string | null; body: string; createdAt: Date }[];
  activity: { actor: string | null; type: string; data: Record<string, unknown>; createdAt: Date }[];
  createdAt: Date;
  updatedAt: Date;
}

export type TicketSearchRow = Omit<TicketRow, 'group'> & { board: string };

interface Scope {
  workspaceRef?: string;
  defaultWorkspaceId?: string | null;
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
    let results = await this.tickets.search(userId, workspaceId, {
      q: input.q,
      boardId,
      assigneeId,
      state: input.state,
      limit: input.limit,
    });
    if (input.status) {
      const wanted = input.status.trim().toLowerCase();
      results = results.filter((ticket) => ticket.statusName.toLowerCase() === wanted);
    }
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

  private async read(userId: string, workspaceId: string, key: string): Promise<TicketReadResult> {
    const detail = await this.tickets.getTicketByKey(userId, workspaceId, key);
    const members = await this.tickets.members(userId, workspaceId);
    return {
      ...this.toRow(workspaceId, detail.ticket, [detail.status], [detail.group], members),
      board: { key: detail.board.key, name: detail.board.name },
      description: detail.ticket.description,
      comments: detail.comments.map((comment) => ({
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
    await this.docs.requireWorkspaceAccess(userId, tokenId, workspace.workspaceId, write);
    return workspace.workspaceId;
  }

  /** Match by id or case-insensitive name; a miss lists the valid names. */
  private pick<T extends { id: string; name: string }>(items: T[], ref: string, label: 'status' | 'group'): T {
    const wanted = ref.trim().toLowerCase();
    const hit = items.find((item) => item.id === ref.trim()) ?? items.find((item) => item.name.toLowerCase() === wanted);
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
