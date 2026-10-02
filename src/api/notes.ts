import { apiRequest, type NoteKind, type NoteTag, type NoteVisibility, type PublicNote } from './client';

export type ListNotesQuery = {
  trashed?: boolean;
  q?: string;
  tagId?: string;
  scope?: 'mine' | 'shared';
};

export type NoteBody = {
  note: PublicNote;
  content: string;
  hash: string;
  updatedAt: string;
};

export type NotePatch = {
  title?: string;
  icon?: string | null;
  cover?: string | null;
  parentId?: string | null;
  position?: number;
  visibility?: NoteVisibility;
  pinned?: boolean;
};

export async function listNotes(
  accessToken: string,
  workspaceId: string,
  query: ListNotesQuery = {}
): Promise<PublicNote[]> {
  const params = new URLSearchParams();
  if (query.trashed) params.set('trashed', '1');
  if (query.q) params.set('q', query.q);
  if (query.tagId) params.set('tagId', query.tagId);
  if (query.scope) params.set('scope', query.scope);
  const suffix = params.size ? `?${params.toString()}` : '';
  const data = await apiRequest<{ notes: PublicNote[] }>(
    `/api/workspaces/${workspaceId}/notes${suffix}`,
    { accessToken }
  );
  return data.notes;
}

export type KanbanCard = {
  noteId: string;
  position: number;
  note: PublicNote;
};

export type KanbanColumn = {
  id: string;
  title: string;
  position: number;
  cards: KanbanCard[];
};

export type KanbanBoardData = {
  board: PublicNote;
  columns: KanbanColumn[];
};

export async function createNote(
  accessToken: string,
  workspaceId: string,
  input: {
    title?: string;
    parentId?: string | null;
    icon?: string | null;
    visibility?: NoteVisibility;
    kind?: NoteKind;
  } = {}
): Promise<PublicNote> {
  const data = await apiRequest<{ note: PublicNote }>(`/api/workspaces/${workspaceId}/notes`, {
    method: 'POST',
    accessToken,
    body: JSON.stringify(input),
  });
  return data.note;
}

export async function getNote(accessToken: string, noteId: string): Promise<NoteBody> {
  return apiRequest<NoteBody>(`/api/notes/${noteId}`, { accessToken });
}

export async function patchNote(accessToken: string, noteId: string, input: NotePatch): Promise<PublicNote> {
  const data = await apiRequest<{ note: PublicNote }>(`/api/notes/${noteId}`, {
    method: 'PATCH',
    accessToken,
    body: JSON.stringify(input),
  });
  return data.note;
}

export async function putNoteContent(
  accessToken: string,
  noteId: string,
  content: string,
  hash?: string
): Promise<NoteBody> {
  return apiRequest<NoteBody>(`/api/notes/${noteId}/content`, {
    method: 'PUT',
    accessToken,
    body: JSON.stringify({ content, hash }),
  });
}

export async function setNoteTags(accessToken: string, noteId: string, tagIds: string[]): Promise<PublicNote> {
  const data = await apiRequest<{ note: PublicNote }>(`/api/notes/${noteId}/tags`, {
    method: 'PUT',
    accessToken,
    body: JSON.stringify({ tagIds }),
  });
  return data.note;
}

export async function deleteNote(accessToken: string, noteId: string): Promise<void> {
  await apiRequest(`/api/notes/${noteId}`, { method: 'DELETE', accessToken });
}

export async function restoreNote(accessToken: string, noteId: string): Promise<PublicNote> {
  const data = await apiRequest<{ note: PublicNote }>(`/api/notes/${noteId}/restore`, {
    method: 'POST',
    accessToken,
  });
  return data.note;
}

export async function deleteNotePermanent(accessToken: string, noteId: string): Promise<string[]> {
  const data = await apiRequest<{ ids: string[] }>(`/api/notes/${noteId}/permanent`, {
    method: 'DELETE',
    accessToken,
  });
  return data.ids;
}

export async function getKanbanBoard(accessToken: string, noteId: string): Promise<KanbanBoardData> {
  return apiRequest<KanbanBoardData>(`/api/notes/${noteId}/board`, { accessToken });
}

export async function createKanbanColumn(
  accessToken: string,
  noteId: string,
  title?: string
): Promise<KanbanBoardData> {
  return apiRequest<KanbanBoardData>(`/api/notes/${noteId}/columns`, {
    method: 'POST',
    accessToken,
    body: JSON.stringify({ title }),
  });
}

export async function patchKanbanColumn(
  accessToken: string,
  columnId: string,
  input: { title?: string; position?: number }
): Promise<KanbanBoardData> {
  return apiRequest<KanbanBoardData>(`/api/kanban-columns/${columnId}`, {
    method: 'PATCH',
    accessToken,
    body: JSON.stringify(input),
  });
}

export async function deleteKanbanColumn(accessToken: string, columnId: string): Promise<KanbanBoardData> {
  return apiRequest<KanbanBoardData>(`/api/kanban-columns/${columnId}`, { method: 'DELETE', accessToken });
}

export async function orderKanbanColumns(
  accessToken: string,
  noteId: string,
  columnIds: string[]
): Promise<KanbanBoardData> {
  return apiRequest<KanbanBoardData>(`/api/notes/${noteId}/columns/order`, {
    method: 'PUT',
    accessToken,
    body: JSON.stringify({ columnIds }),
  });
}

export async function createKanbanCard(
  accessToken: string,
  noteId: string,
  input: { columnId: string; title?: string; noteId?: string }
): Promise<KanbanBoardData> {
  return apiRequest<KanbanBoardData>(`/api/notes/${noteId}/cards`, {
    method: 'POST',
    accessToken,
    body: JSON.stringify(input),
  });
}

export async function moveKanbanCard(
  accessToken: string,
  input: { boardId: string; noteId: string; columnId: string; position: number }
): Promise<KanbanBoardData> {
  return apiRequest<KanbanBoardData>('/api/kanban-cards', {
    method: 'PATCH',
    accessToken,
    body: JSON.stringify(input),
  });
}

export async function removeKanbanCard(
  accessToken: string,
  boardId: string,
  noteId: string
): Promise<KanbanBoardData> {
  return apiRequest<KanbanBoardData>('/api/kanban-cards', {
    method: 'DELETE',
    accessToken,
    body: JSON.stringify({ boardId, noteId }),
  });
}

export async function listNoteTags(accessToken: string, workspaceId: string): Promise<NoteTag[]> {
  const data = await apiRequest<{ tags: NoteTag[] }>(`/api/workspaces/${workspaceId}/note-tags`, {
    accessToken,
  });
  return data.tags;
}

export async function createNoteTag(
  accessToken: string,
  workspaceId: string,
  input: { name: string; color?: string }
): Promise<NoteTag> {
  const data = await apiRequest<{ tag: NoteTag }>(`/api/workspaces/${workspaceId}/note-tags`, {
    method: 'POST',
    accessToken,
    body: JSON.stringify(input),
  });
  return data.tag;
}
