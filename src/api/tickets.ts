import { apiRequest } from './client';

export const TICKET_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUS_CATEGORIES = ['todo', 'doing', 'done'] as const;
export type TicketStatusCategory = (typeof TICKET_STATUS_CATEGORIES)[number];

export type TicketBoard = {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  description: string | null;
  position: number;
  ticketCount: number;
  openCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TicketStatus = {
  id: string;
  boardId: string;
  name: string;
  color: string;
  category: TicketStatusCategory;
  position: number;
};

export type TicketGroup = {
  id: string;
  boardId: string;
  name: string;
  color: string;
  position: number;
};

export type Ticket = {
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
  createdAt: string;
  updatedAt: string;
};

export type TicketSearchResult = Ticket & {
  boardName: string;
  statusName: string;
  statusColor: string;
  statusCategory: TicketStatusCategory;
};

export type TicketBoardView = {
  board: TicketBoard;
  statuses: TicketStatus[];
  groups: TicketGroup[];
  tickets: Ticket[];
};

export type TicketComment = {
  id: string;
  ticketId: string;
  authorId: string | null;
  authorName: string | null;
  body: string;
  editable: boolean;
  deletable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TicketActivity = {
  id: string;
  ticketId: string;
  actorId: string | null;
  actorName: string | null;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
};

export type TicketDetail = {
  ticket: Ticket;
  board: TicketBoard;
  status: TicketStatus;
  group: TicketGroup;
  comments: TicketComment[];
  activity: TicketActivity[];
};

export type TicketPatch = {
  title?: string;
  description?: string;
  groupId?: string;
  statusId?: string;
  priority?: TicketPriority;
  dueDate?: string | null;
  labels?: string[];
  assigneeIds?: string[];
};

export type TicketMove = {
  groupId?: string;
  position?: number;
  statusId?: string;
  statusPosition?: number;
};

export type BoardPatch = { name?: string; key?: string; description?: string | null; position?: number };
export type StatusInput = { name?: string; color?: string; category?: TicketStatusCategory };
export type GroupInput = { name?: string; color?: string };

export type TicketSearch = {
  q?: string;
  assignee?: 'me' | string;
  boardId?: string;
  state?: TicketStatusCategory | 'open';
  limit?: number;
};

const json = (body: unknown) => JSON.stringify(body);

export async function listTicketBoards(accessToken: string, workspaceId: string): Promise<TicketBoard[]> {
  const data = await apiRequest<{ boards: TicketBoard[] }>(`/api/workspaces/${workspaceId}/ticket-boards`, {
    accessToken,
  });
  return data.boards;
}

export function createTicketBoard(
  accessToken: string,
  workspaceId: string,
  input: { name?: string; key?: string; description?: string | null }
): Promise<TicketBoardView> {
  return apiRequest<TicketBoardView>(`/api/workspaces/${workspaceId}/ticket-boards`, {
    method: 'POST',
    accessToken,
    body: json(input),
  });
}

export async function searchTickets(
  accessToken: string,
  workspaceId: string,
  search: TicketSearch
): Promise<TicketSearchResult[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const data = await apiRequest<{ tickets: TicketSearchResult[] }>(
    `/api/workspaces/${workspaceId}/tickets?${params.toString()}`,
    { accessToken }
  );
  return data.tickets;
}

export function getTicketByKey(accessToken: string, workspaceId: string, key: string): Promise<TicketDetail> {
  return apiRequest<TicketDetail>(
    `/api/workspaces/${workspaceId}/tickets/by-key/${encodeURIComponent(key)}`,
    { accessToken }
  );
}

export function getTicketBoard(accessToken: string, boardId: string): Promise<TicketBoardView> {
  return apiRequest<TicketBoardView>(`/api/ticket-boards/${boardId}`, { accessToken });
}

export async function patchTicketBoard(accessToken: string, boardId: string, input: BoardPatch): Promise<TicketBoard> {
  const data = await apiRequest<{ board: TicketBoard }>(`/api/ticket-boards/${boardId}`, {
    method: 'PATCH',
    accessToken,
    body: json(input),
  });
  return data.board;
}

export async function deleteTicketBoard(accessToken: string, boardId: string): Promise<void> {
  await apiRequest<null>(`/api/ticket-boards/${boardId}`, { method: 'DELETE', accessToken });
}

export async function createTicketStatus(
  accessToken: string,
  boardId: string,
  input: StatusInput & { name: string }
): Promise<TicketStatus> {
  const data = await apiRequest<{ status: TicketStatus }>(`/api/ticket-boards/${boardId}/statuses`, {
    method: 'POST',
    accessToken,
    body: json(input),
  });
  return data.status;
}

export async function patchTicketStatus(accessToken: string, statusId: string, input: StatusInput): Promise<TicketStatus> {
  const data = await apiRequest<{ status: TicketStatus }>(`/api/ticket-statuses/${statusId}`, {
    method: 'PATCH',
    accessToken,
    body: json(input),
  });
  return data.status;
}

export function deleteTicketStatus(accessToken: string, statusId: string, moveTo?: string): Promise<TicketBoardView> {
  return apiRequest<TicketBoardView>(`/api/ticket-statuses/${statusId}`, {
    method: 'DELETE',
    accessToken,
    body: json({ moveTo }),
  });
}

export async function orderTicketStatuses(accessToken: string, boardId: string, ids: string[]): Promise<TicketStatus[]> {
  const data = await apiRequest<{ statuses: TicketStatus[] }>(`/api/ticket-boards/${boardId}/statuses/order`, {
    method: 'PUT',
    accessToken,
    body: json({ ids }),
  });
  return data.statuses;
}

export async function createTicketGroup(
  accessToken: string,
  boardId: string,
  input: GroupInput & { name: string }
): Promise<TicketGroup> {
  const data = await apiRequest<{ group: TicketGroup }>(`/api/ticket-boards/${boardId}/groups`, {
    method: 'POST',
    accessToken,
    body: json(input),
  });
  return data.group;
}

export async function patchTicketGroup(accessToken: string, groupId: string, input: GroupInput): Promise<TicketGroup> {
  const data = await apiRequest<{ group: TicketGroup }>(`/api/ticket-groups/${groupId}`, {
    method: 'PATCH',
    accessToken,
    body: json(input),
  });
  return data.group;
}

export function deleteTicketGroup(accessToken: string, groupId: string, moveTo?: string): Promise<TicketBoardView> {
  return apiRequest<TicketBoardView>(`/api/ticket-groups/${groupId}`, {
    method: 'DELETE',
    accessToken,
    body: json({ moveTo }),
  });
}

export async function orderTicketGroups(accessToken: string, boardId: string, ids: string[]): Promise<TicketGroup[]> {
  const data = await apiRequest<{ groups: TicketGroup[] }>(`/api/ticket-boards/${boardId}/groups/order`, {
    method: 'PUT',
    accessToken,
    body: json({ ids }),
  });
  return data.groups;
}

export async function createTicket(
  accessToken: string,
  boardId: string,
  input: TicketPatch & { title: string }
): Promise<Ticket> {
  const data = await apiRequest<{ ticket: Ticket }>(`/api/ticket-boards/${boardId}/tickets`, {
    method: 'POST',
    accessToken,
    body: json(input),
  });
  return data.ticket;
}

export function getTicket(accessToken: string, ticketId: string): Promise<TicketDetail> {
  return apiRequest<TicketDetail>(`/api/tickets/${ticketId}`, { accessToken });
}

export async function patchTicket(accessToken: string, ticketId: string, input: TicketPatch): Promise<Ticket> {
  const data = await apiRequest<{ ticket: Ticket }>(`/api/tickets/${ticketId}`, {
    method: 'PATCH',
    accessToken,
    body: json(input),
  });
  return data.ticket;
}

export function moveTicket(accessToken: string, ticketId: string, input: TicketMove): Promise<TicketBoardView> {
  return apiRequest<TicketBoardView>(`/api/tickets/${ticketId}/move`, {
    method: 'PUT',
    accessToken,
    body: json(input),
  });
}

export async function deleteTicket(accessToken: string, ticketId: string): Promise<void> {
  await apiRequest<null>(`/api/tickets/${ticketId}`, { method: 'DELETE', accessToken });
}

export async function addTicketComment(accessToken: string, ticketId: string, body: string): Promise<TicketComment> {
  const data = await apiRequest<{ comment: TicketComment }>(`/api/tickets/${ticketId}/comments`, {
    method: 'POST',
    accessToken,
    body: json({ body }),
  });
  return data.comment;
}

export async function patchTicketComment(accessToken: string, commentId: string, body: string): Promise<TicketComment> {
  const data = await apiRequest<{ comment: TicketComment }>(`/api/ticket-comments/${commentId}`, {
    method: 'PATCH',
    accessToken,
    body: json({ body }),
  });
  return data.comment;
}

export async function deleteTicketComment(accessToken: string, commentId: string): Promise<void> {
  await apiRequest<null>(`/api/ticket-comments/${commentId}`, { method: 'DELETE', accessToken });
}
