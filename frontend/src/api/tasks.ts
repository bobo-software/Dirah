import { apiRequest } from './client';

export type TaskListVisibility = 'private' | 'workspace';

export type TaskListMode = 'checklist';

export type TaskList = {
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
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskItem = {
  id: string;
  listId: string;
  text: string;
  checked: boolean;
  checkedAt: string | null;
  checkedBy: string | null;
  position: number;
};

export type TaskListView = {
  list: TaskList;
  items: TaskItem[];
};

export type TaskListPatch = {
  title?: string;
  icon?: string | null;
  visibility?: TaskListVisibility;
  position?: number;
};

export async function listTaskLists(accessToken: string, workspaceId: string): Promise<TaskList[]> {
  const data = await apiRequest<{ lists: TaskList[] }>(`/api/workspaces/${workspaceId}/task-lists`, {
    accessToken,
  });
  return data.lists;
}

export async function createTaskList(
  accessToken: string,
  workspaceId: string,
  input: { title?: string; visibility?: TaskListVisibility; mode?: TaskListMode } = {}
): Promise<TaskList> {
  const data = await apiRequest<{ list: TaskList }>(`/api/workspaces/${workspaceId}/task-lists`, {
    method: 'POST',
    accessToken,
    body: JSON.stringify(input),
  });
  return data.list;
}

export async function createTaskListFromNote(accessToken: string, noteId: string): Promise<TaskListView> {
  return apiRequest<TaskListView>('/api/task-lists/from-note', {
    method: 'POST',
    accessToken,
    body: JSON.stringify({ noteId }),
  });
}

export async function getTaskList(accessToken: string, listId: string): Promise<TaskListView> {
  return apiRequest<TaskListView>(`/api/task-lists/${listId}`, { accessToken });
}

export async function patchTaskList(accessToken: string, listId: string, input: TaskListPatch): Promise<TaskList> {
  const data = await apiRequest<{ list: TaskList }>(`/api/task-lists/${listId}`, {
    method: 'PATCH',
    accessToken,
    body: JSON.stringify(input),
  });
  return data.list;
}

export async function deleteTaskList(accessToken: string, listId: string): Promise<void> {
  await apiRequest<null>(`/api/task-lists/${listId}`, { method: 'DELETE', accessToken });
}

export async function addTaskItems(accessToken: string, listId: string, texts: string[]): Promise<TaskListView> {
  return apiRequest<TaskListView>(`/api/task-lists/${listId}/items`, {
    method: 'POST',
    accessToken,
    body: JSON.stringify({ texts }),
  });
}

export async function orderTaskItems(accessToken: string, listId: string, itemIds: string[]): Promise<TaskListView> {
  return apiRequest<TaskListView>(`/api/task-lists/${listId}/items/order`, {
    method: 'PUT',
    accessToken,
    body: JSON.stringify({ itemIds }),
  });
}

export async function resetTaskList(accessToken: string, listId: string): Promise<TaskListView> {
  return apiRequest<TaskListView>(`/api/task-lists/${listId}/reset`, { method: 'POST', accessToken });
}

export async function patchTaskItem(
  accessToken: string,
  itemId: string,
  input: { text?: string; checked?: boolean }
): Promise<TaskItem> {
  const data = await apiRequest<{ item: TaskItem }>(`/api/task-list-items/${itemId}`, {
    method: 'PATCH',
    accessToken,
    body: JSON.stringify(input),
  });
  return data.item;
}

export async function deleteTaskItem(accessToken: string, itemId: string): Promise<void> {
  await apiRequest<null>(`/api/task-list-items/${itemId}`, { method: 'DELETE', accessToken });
}
