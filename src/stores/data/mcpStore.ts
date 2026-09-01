import { create } from 'zustand';
import {
  listMcpTokens,
  listMcpAccess,
  createMcpToken,
  updateMcpToken,
  revokeMcpToken,
  setMcpAccess,
  setWorkspaceMcpEnabled,
  type McpAccessRow,
  type McpToken,
} from '../../api/mcp';
import { useAuthStore } from './authStore';

type McpState = {
  tokens: McpToken[];
  access: McpAccessRow[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  fetchAll: () => Promise<void>;
  createToken: (name: string, defaultWorkspaceId?: string) => Promise<McpToken>;
  updateToken: (id: string, input: { name?: string; defaultWorkspaceId?: string | null }) => Promise<void>;
  revokeToken: (id: string) => Promise<void>;
  setAccess: (workspaces: Array<{ workspaceId: string; canWrite?: boolean }>) => Promise<void>;
  setWorkspaceEnabled: (workspaceId: string, enabled: boolean) => Promise<void>;
};

function token(): string {
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) throw new Error('Not signed in');
  return accessToken;
}

export const useMcpStore = create<McpState>((set, get) => ({
  tokens: [],
  access: [],
  loaded: false,
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const [tokens, access] = await Promise.all([listMcpTokens(token()), listMcpAccess(token())]);
      set({ tokens, access, loaded: true, loading: false });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Could not load MCP settings' });
      throw error;
    }
  },

  createToken: async (name, defaultWorkspaceId) => {
    const created = await createMcpToken(token(), name, defaultWorkspaceId);
    await get().fetchAll();
    return created;
  },

  updateToken: async (id, input) => {
    await updateMcpToken(token(), id, input);
    await get().fetchAll();
  },

  revokeToken: async (id) => {
    await revokeMcpToken(token(), id);
    await get().fetchAll();
  },

  setAccess: async (workspaces) => {
    const access = await setMcpAccess(token(), workspaces);
    set({ access });
  },

  setWorkspaceEnabled: async (workspaceId, enabled) => {
    await setWorkspaceMcpEnabled(token(), workspaceId, enabled);
    await get().fetchAll();
  },
}));
