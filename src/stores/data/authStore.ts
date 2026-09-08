import { create } from 'zustand';
import { apiRequest, type AuthTokens, type PublicUser, type PublicWorkspace } from '../../api/client';
import { useWorkspaceStore } from './workspaceStore';
import { usePageStore } from './pageStore';

export const REFRESH_KEY = 'dira.refreshToken';

type AuthState = {
  user: PublicUser | null;
  accessToken: string | null;
  ready: boolean;
  error: string | null;
  initAuth: () => Promise<void>;
  register: (email: string, password: string) => Promise<PublicWorkspace>;
  acceptInvite: (token: string, password: string) => Promise<PublicWorkspace>;
  acceptInviteAsSession: (token: string) => Promise<PublicWorkspace>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

let initPromise: Promise<void> | null = null;

async function applyTokens(tokens: AuthTokens, set: (partial: Partial<AuthState>) => void) {
  set({ accessToken: tokens.accessToken });
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  const { user } = await apiRequest<{ user: PublicUser }>('/api/auth/me', {
    accessToken: tokens.accessToken,
  });
  set({ user });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  ready: false,
  error: null,

  initAuth: () => {
    if (!initPromise) {
      initPromise = (async () => {
        const existing = localStorage.getItem(REFRESH_KEY);
        if (!existing) {
          set({ ready: true });
          return;
        }
        try {
          const { tokens } = await apiRequest<{ tokens: AuthTokens }>('/api/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({ refreshToken: existing }),
          });
          await applyTokens(tokens, set);
        } catch {
          localStorage.removeItem(REFRESH_KEY);
          set({ user: null, accessToken: null });
        } finally {
          set({ ready: true });
        }
      })();
    }
    return initPromise;
  },

  register: async (email, password) => {
    set({ error: null });
    const data = await apiRequest<{ user: PublicUser; tokens: AuthTokens; workspace: PublicWorkspace }>(
      '/api/auth/register',
      { method: 'POST', body: JSON.stringify({ email, password }) }
    );
    set({ accessToken: data.tokens.accessToken, user: data.user });
    localStorage.setItem(REFRESH_KEY, data.tokens.refreshToken);
    return data.workspace;
  },

  acceptInvite: async (token, password) => {
    set({ error: null });
    const data = await apiRequest<{ user: PublicUser; tokens: AuthTokens; workspace: PublicWorkspace }>(
      `/api/invites/${token}/accept`,
      { method: 'POST', body: JSON.stringify({ password }) }
    );
    set({ accessToken: data.tokens.accessToken, user: data.user });
    localStorage.setItem(REFRESH_KEY, data.tokens.refreshToken);
    return data.workspace;
  },

  acceptInviteAsSession: async (token) => {
    set({ error: null });
    const accessToken = get().accessToken;
    if (!accessToken) throw new Error('Not signed in');
    const data = await apiRequest<{ user: PublicUser; workspace: PublicWorkspace }>(
      `/api/invites/${token}/accept`,
      { method: 'POST', accessToken, body: JSON.stringify({}) }
    );
    set({ user: data.user });
    return data.workspace;
  },

  login: async (email, password) => {
    set({ error: null });
    const data = await apiRequest<{ user: PublicUser; tokens: AuthTokens }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await applyTokens(data.tokens, set);
  },

  logout: async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    try {
      if (refreshToken) {
        await apiRequest('/api/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
      }
    } finally {
      localStorage.removeItem(REFRESH_KEY);
      set({ accessToken: null, user: null });
      useWorkspaceStore.getState().reset();
      usePageStore.getState().reset();
    }
  },
}));
