import { create } from 'zustand';
import {
  addTaskItems,
  createTaskList,
  deleteTaskItem,
  deleteTaskList,
  getTaskList,
  listTaskLists,
  orderTaskItems,
  patchTaskItem,
  patchTaskList,
  resetTaskList,
  type TaskItem,
  type TaskList,
  type TaskListPatch,
  type TaskListView,
  type TaskListVisibility,
} from '../../api/tasks';
import { useAuthStore } from './authStore';

// Stable reference for "no lists yet" selectors; see EMPTY_PAGES in pageStore.
export const EMPTY_TASK_LISTS: TaskList[] = [];

type TaskState = {
  byWorkspace: Record<string, TaskList[]>;
  loadedWorkspaces: Set<string>;
  views: Record<string, TaskListView>;
  fetchLists: (workspaceId: string) => Promise<TaskList[]>;
  createList: (workspaceId: string, input?: { title?: string; visibility?: TaskListVisibility }) => Promise<TaskList>;
  patchList: (listId: string, input: TaskListPatch) => Promise<TaskList>;
  deleteList: (listId: string) => Promise<void>;
  fetchList: (listId: string) => Promise<TaskListView>;
  addItems: (listId: string, texts: string[]) => Promise<TaskListView>;
  moveItem: (listId: string, itemId: string, offset: number) => Promise<void>;
  resetList: (listId: string) => Promise<TaskListView>;
  setChecked: (listId: string, itemId: string, checked: boolean) => Promise<void>;
  renameItem: (listId: string, itemId: string, text: string) => Promise<void>;
  removeItem: (listId: string, itemId: string) => Promise<void>;
  reset: () => void;
};

function token(): string {
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) throw new Error('Not signed in');
  return accessToken;
}

function upsert(lists: TaskList[], list: TaskList): TaskList[] {
  const index = lists.findIndex((item) => item.id === list.id);
  if (index === -1) return [...lists, list];
  const next = lists.slice();
  next[index] = list;
  return next;
}

/** Recomputes the counts a list summary shows from its items. */
function withItems(view: TaskListView, items: TaskItem[]): TaskListView {
  return {
    list: { ...view.list, itemCount: items.length, checkedCount: items.filter((item) => item.checked).length },
    items,
  };
}

export const useTaskStore = create<TaskState>((set, get) => {
  /** Stores a list view and keeps the workspace summary in step with it. */
  function putView(view: TaskListView) {
    set((state) => {
      const lists = state.byWorkspace[view.list.workspaceId];
      return {
        views: { ...state.views, [view.list.id]: view },
        byWorkspace: lists
          ? { ...state.byWorkspace, [view.list.workspaceId]: upsert(lists, view.list) }
          : state.byWorkspace,
      };
    });
  }

  function updateItems(listId: string, update: (items: TaskItem[]) => TaskItem[]): TaskListView | undefined {
    const view = get().views[listId];
    if (!view) return undefined;
    putView(withItems(view, update(view.items)));
    return view;
  }

  return {
    byWorkspace: {},
    loadedWorkspaces: new Set(),
    views: {},

    fetchLists: async (workspaceId) => {
      const lists = await listTaskLists(token(), workspaceId);
      set((state) => ({
        byWorkspace: { ...state.byWorkspace, [workspaceId]: lists },
        loadedWorkspaces: new Set(state.loadedWorkspaces).add(workspaceId),
      }));
      return lists;
    },

    createList: async (workspaceId, input) => {
      const list = await createTaskList(token(), workspaceId, input);
      set((state) => ({
        byWorkspace: { ...state.byWorkspace, [workspaceId]: upsert(state.byWorkspace[workspaceId] ?? [], list) },
        views: { ...state.views, [list.id]: { list, items: [] } },
      }));
      return list;
    },

    patchList: async (listId, input) => {
      const list = await patchTaskList(token(), listId, input);
      const view = get().views[listId];
      if (view) putView({ list, items: view.items });
      else
        set((state) => ({
          byWorkspace: {
            ...state.byWorkspace,
            [list.workspaceId]: upsert(state.byWorkspace[list.workspaceId] ?? [], list),
          },
        }));
      return list;
    },

    deleteList: async (listId) => {
      await deleteTaskList(token(), listId);
      set((state) => {
        const views = { ...state.views };
        delete views[listId];
        const byWorkspace: Record<string, TaskList[]> = {};
        for (const [workspaceId, lists] of Object.entries(state.byWorkspace)) {
          byWorkspace[workspaceId] = lists.filter((list) => list.id !== listId);
        }
        return { views, byWorkspace };
      });
    },

    fetchList: async (listId) => {
      const view = await getTaskList(token(), listId);
      putView(view);
      return view;
    },

    addItems: async (listId, texts) => {
      const view = await addTaskItems(token(), listId, texts);
      putView(view);
      return view;
    },

    moveItem: async (listId, itemId, offset) => {
      const view = get().views[listId];
      if (!view) return;
      const ids = view.items.map((item) => item.id);
      const from = ids.indexOf(itemId);
      const to = from + offset;
      if (from === -1 || to < 0 || to >= ids.length) return;
      ids.splice(to, 0, ...ids.splice(from, 1));
      const byId = new Map(view.items.map((item) => [item.id, item]));
      putView(withItems(view, ids.map((id) => byId.get(id)!)));
      try {
        putView(await orderTaskItems(token(), listId, ids));
      } catch (error) {
        putView(view);
        throw error;
      }
    },

    resetList: async (listId) => {
      const view = await resetTaskList(token(), listId);
      putView(view);
      return view;
    },

    // Optimistic, because the runner fires one of these per answer and must not wait on the network.
    setChecked: async (listId, itemId, checked) => {
      const previous = get().views[listId]?.items.find((item) => item.id === itemId);
      updateItems(listId, (items) => items.map((item) => (item.id === itemId ? { ...item, checked } : item)));
      try {
        const saved = await patchTaskItem(token(), itemId, { checked });
        updateItems(listId, (items) => items.map((item) => (item.id === itemId ? saved : item)));
      } catch (error) {
        if (previous) {
          updateItems(listId, (items) => items.map((item) => (item.id === itemId ? previous : item)));
        }
        throw error;
      }
    },

    renameItem: async (listId, itemId, text) => {
      const saved = await patchTaskItem(token(), itemId, { text });
      updateItems(listId, (items) => items.map((item) => (item.id === itemId ? saved : item)));
    },

    removeItem: async (listId, itemId) => {
      await deleteTaskItem(token(), itemId);
      updateItems(listId, (items) => items.filter((item) => item.id !== itemId));
    },

    reset: () => set({ byWorkspace: {}, loadedWorkspaces: new Set(), views: {} }),
  };
});
