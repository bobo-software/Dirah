import { create } from 'zustand';
import {
  listMcpTokens,
  createMcpToken,
  updateMcpToken,
  revokeMcpToken,
  listTokenAccess,
  setTokenAccess,
  setWorkspaceMcpEnabled,
  type McpToken,
  type TokenAccessRow,
} from '../../api/mcp';
import { useAuthStore } from './authStore';

type McpState = {
  tokens: McpToken[];
  tokenAccess: Record<string, TokenAccessRow[]>;
  tokenAccessLoading: Record<string, boolean>;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  fetchAll: () => Promise<void>;
  createToken: (
    name: string,
    defaultWorkspaceId?: string,
    workspaceAccess?: Array<{ workspaceId: string; canWrite?: boolean }>
  ) => Promise<McpToken>;
  updateToken: (id: string, input: { name?: string; defaultWorkspaceId?: string | null }) => Promise<void>;
  revokeToken: (id: string) => Promise<void>;
  fetchTokenAccess: (tokenId: string) => Promise<void>;
  setTokenAccess: (tokenId: string, items: Array<{ workspaceId: string; canWrite?: boolean }>) => Promise<void>;
  setWorkspaceEnabled: (workspaceId: string, enabled: boolean) => Promise<void>;
};

function token(): string {
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) throw new Error('Not signed in');
  return accessToken;
}

export const useMcpStore = create<McpState>((set, get) => ({
  tokens: [],
  tokenAccess: {},
  tokenAccessLoading: {},
  loaded: false,
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const tokens = await listMcpTokens(token());
      set({ tokens, loaded: true, loading: false });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Could not load MCP settings' });
      throw error;
    }
  },

  createToken: async (name, defaultWorkspaceId, workspaceAccess) => {
    const created = await createMcpToken(token(), name, defaultWorkspaceId, workspaceAccess);
    set((state) => ({
      tokens: [...state.tokens, created],
      tokenAccess: { ...state.tokenAccess, [created.id]: created.access },
    }));
    return created;
  },

  updateToken: async (id, input) => {
    await updateMcpToken(token(), id, input);
    await get().fetchAll();
  },

  revokeToken: async (id) => {
    await revokeMcpToken(token(), id);
    await get().fetchAll();
    set((state) => {
      const tokenAccess = { ...state.tokenAccess };
      const tokenAccessLoading = { ...state.tokenAccessLoading };
      delete tokenAccess[id];
      delete tokenAccessLoading[id];
      return { tokenAccess, tokenAccessLoading };
    });
  },

  fetchTokenAccess: async (tokenId) => {
    if (get().tokenAccess[tokenId]) return;
    set((state) => ({ tokenAccessLoading: { ...state.tokenAccessLoading, [tokenId]: true } }));
    try {
      const rows = await listTokenAccess(token(), tokenId);
      set((state) => ({ tokenAccess: { ...state.tokenAccess, [tokenId]: rows } }));
    } finally {
      set((state) => ({ tokenAccessLoading: { ...state.tokenAccessLoading, [tokenId]: false } }));
    }
  },

  setTokenAccess: async (tokenId, items) => {
    const result = await setTokenAccess(token(), tokenId, items);
    set((state) => ({ tokenAccess: { ...state.tokenAccess, [tokenId]: result } }));
  },

  setWorkspaceEnabled: async (workspaceId, enabled) => {
    await setWorkspaceMcpEnabled(token(), workspaceId, enabled);
    await get().fetchAll();
  },
}));
