import { create } from 'zustand';
import { apiRequest, type AuthTokens, type PublicUser, type PublicWorkspace } from '../../api/client';
import type { UserCryptoBundle } from '../../api/crypto';
import { changePassword as changePasswordRequest, updateProfile as updateProfileRequest } from '../../api/profile';
import { clearCryptoSession, provisionAccount } from '../../crypto/workspaceCrypto';
import { useMarkdownContentStore } from './markdownContentStore';
import { useWorkspaceStore } from './workspaceStore';
import { usePageStore } from './pageStore';
import { useNoteStore } from './noteStore';
import { useTaskStore } from './taskStore';
import { useTicketStore } from './ticketStore';

export const REFRESH_KEY = 'dirah.refreshToken';

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
  refreshUser: () => Promise<void>;
  updateProfile: (input: {
    name?: string | null;
    role?: string | null;
    about?: string | null;
    email?: string;
    currentPassword?: string;
  }) => Promise<void>;
  changePassword: (currentPassword: string | undefined, newPassword: string, crypto?: UserCryptoBundle) => Promise<void>;
};

let initPromise: Promise<void> | null = null;

function takeLegacyRefresh(): string | null {
  const existing = localStorage.getItem(REFRESH_KEY);
  if (existing) localStorage.removeItem(REFRESH_KEY);
  return existing;
}

async function unlockWithPassword(accessToken: string, password: string) {
  try {
    await provisionAccount(accessToken, password);
  } catch {
    clearCryptoSession();
  }
}

async function applyAccess(accessToken: string, set: (partial: Partial<AuthState>) => void) {
  set({ accessToken });
  const { user } = await apiRequest<{ user: PublicUser }>('/api/auth/me', { accessToken });
  set({ user });
}

async function refreshSession(legacyRefreshToken: string | null) {
  return apiRequest<{ tokens: AuthTokens }>('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify(legacyRefreshToken ? { refreshToken: legacyRefreshToken } : {}),
  });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  ready: false,
  error: null,

  initAuth: () => {
    if (!initPromise) {
      initPromise = (async () => {
        const legacy = takeLegacyRefresh();
        try {
          const { tokens } = await refreshSession(legacy);
          await applyAccess(tokens.accessToken, set);
        } catch {
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
    localStorage.removeItem(REFRESH_KEY);
    set({ accessToken: data.tokens.accessToken, user: data.user });
    await unlockWithPassword(data.tokens.accessToken, password);
    return data.workspace;
  },

  acceptInvite: async (token, password) => {
    set({ error: null });
    const data = await apiRequest<{ user: PublicUser; tokens: AuthTokens; workspace: PublicWorkspace }>(
      `/api/invites/${token}/accept`,
      { method: 'POST', body: JSON.stringify({ password }) }
    );
    localStorage.removeItem(REFRESH_KEY);
    set({ accessToken: data.tokens.accessToken, user: data.user });
    await unlockWithPassword(data.tokens.accessToken, password);
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
    localStorage.removeItem(REFRESH_KEY);
    await applyAccess(data.tokens.accessToken, set);
    await unlockWithPassword(data.tokens.accessToken, password);
  },

  refreshUser: async () => {
    const accessToken = get().accessToken;
    if (!accessToken) throw new Error('Not signed in');
    const { user } = await apiRequest<{ user: PublicUser }>('/api/auth/me', { accessToken });
    set({ user });
  },

  updateProfile: async (input) => {
    const accessToken = get().accessToken;
    if (!accessToken) throw new Error('Not signed in');
    const user = await updateProfileRequest(accessToken, input);
    set({ user });
  },

  changePassword: async (currentPassword, newPassword, crypto) => {
    const accessToken = get().accessToken;
    if (!accessToken) throw new Error('Not signed in');
    const user = await changePasswordRequest(accessToken, { currentPassword, newPassword, crypto });
    set({ user });
  },

  logout: async () => {
    try {
      await apiRequest('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } finally {
      localStorage.removeItem(REFRESH_KEY);
      clearCryptoSession();
      useMarkdownContentStore.getState().clearAll();
      set({ accessToken: null, user: null });
      useWorkspaceStore.getState().reset();
      usePageStore.getState().reset();
      useNoteStore.getState().reset();
      useTaskStore.getState().reset();
      useTicketStore.getState().reset();
    }
  },
}));
