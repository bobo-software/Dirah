import { create } from 'zustand';
import { apiRequest, type PublicWorkspace } from '../../api/client';
import { useAuthStore } from './authStore';

type WorkspaceState = {
  workspaces: PublicWorkspace[];
  activeWorkspaceId: string | null;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  fetchWorkspaces: (force?: boolean) => Promise<PublicWorkspace[]>;
  setActiveWorkspace: (id: string) => Promise<PublicWorkspace>;
  createWorkspace: (name: string) => Promise<PublicWorkspace>;
  renameWorkspace: (id: string, name: string) => Promise<PublicWorkspace>;
  updateWorkspaceDescription: (id: string, description: string | null) => Promise<PublicWorkspace>;
  deleteWorkspace: (id: string) => Promise<void>;
  reset: () => void;
};

function token(): string {
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) throw new Error('Not signed in');
  return accessToken;
}

function upsert(list: PublicWorkspace[], workspace: PublicWorkspace): PublicWorkspace[] {
  const index = list.findIndex((item) => item.id === workspace.id);
  if (index === -1) return [...list, workspace];
  const next = list.slice();
  next[index] = workspace;
  return next;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  loaded: false,
  loading: false,
  error: null,

  fetchWorkspaces: async (force = false) => {
    const state = get();
    if (state.loaded && !force) return state.workspaces;
    set({ loading: true, error: null });
    try {
      const data = await apiRequest<{ workspaces: PublicWorkspace[] }>('/api/workspaces', {
        accessToken: token(),
      });
      set({ workspaces: data.workspaces, loaded: true, loading: false });
      return data.workspaces;
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Could not load workspaces' });
      throw error;
    }
  },

  setActiveWorkspace: async (id) => {
    const data = await apiRequest<{ workspace: PublicWorkspace }>(`/api/workspaces/${id}`, {
      accessToken: token(),
    });
    set((state) => ({
      workspaces: upsert(state.workspaces, data.workspace),
      activeWorkspaceId: id,
    }));
    return data.workspace;
  },

  createWorkspace: async (name) => {
    const data = await apiRequest<{ workspace: PublicWorkspace }>('/api/workspaces', {
      method: 'POST',
      accessToken: token(),
      body: JSON.stringify({ name }),
    });
    set((state) => ({ workspaces: [...state.workspaces, data.workspace] }));
    return data.workspace;
  },

  renameWorkspace: async (id, name) => {
    const data = await apiRequest<{ workspace: PublicWorkspace }>(`/api/workspaces/${id}`, {
      method: 'PATCH',
      accessToken: token(),
      body: JSON.stringify({ name }),
    });
    set((state) => ({ workspaces: upsert(state.workspaces, data.workspace) }));
    return data.workspace;
  },

  updateWorkspaceDescription: async (id, description) => {
    const data = await apiRequest<{ workspace: PublicWorkspace }>(`/api/workspaces/${id}`, {
      method: 'PATCH',
      accessToken: token(),
      body: JSON.stringify({ description }),
    });
    set((state) => ({ workspaces: upsert(state.workspaces, data.workspace) }));
    return data.workspace;
  },

  deleteWorkspace: async (id) => {
    await apiRequest(`/api/workspaces/${id}`, { method: 'DELETE', accessToken: token() });
    set((state) => ({ workspaces: state.workspaces.filter((item) => item.id !== id) }));
  },

  reset: () => set({ workspaces: [], activeWorkspaceId: null, loaded: false, loading: false, error: null }),
}));
