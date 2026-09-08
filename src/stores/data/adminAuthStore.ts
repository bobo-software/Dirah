import { create } from 'zustand';
import type { AuthTokens } from '../../api/client';
import {
  adminLogin,
  adminLogout,
  adminMe,
  adminRefresh,
  type PublicSystemAdmin,
} from '../../api/admin';

export const ADMIN_REFRESH_KEY = 'dira.admin.refreshToken';

type AdminAuthState = {
  admin: PublicSystemAdmin | null;
  accessToken: string | null;
  ready: boolean;
  error: string | null;
  initAdminAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

let initPromise: Promise<void> | null = null;

async function applyTokens(tokens: AuthTokens, set: (partial: Partial<AdminAuthState>) => void) {
  set({ accessToken: tokens.accessToken });
  localStorage.setItem(ADMIN_REFRESH_KEY, tokens.refreshToken);
  const { admin } = await adminMe(tokens.accessToken);
  set({ admin });
}

export const useAdminAuthStore = create<AdminAuthState>((set) => ({
  admin: null,
  accessToken: null,
  ready: false,
  error: null,

  initAdminAuth: () => {
    if (!initPromise) {
      initPromise = (async () => {
        const existing = localStorage.getItem(ADMIN_REFRESH_KEY);
        if (!existing) {
          set({ ready: true });
          return;
        }
        try {
          const { tokens } = await adminRefresh(existing);
          await applyTokens(tokens, set);
        } catch {
          localStorage.removeItem(ADMIN_REFRESH_KEY);
          set({ admin: null, accessToken: null });
        } finally {
          set({ ready: true });
        }
      })();
    }
    return initPromise;
  },

  login: async (email, password) => {
    set({ error: null });
    const data = await adminLogin(email, password);
    await applyTokens(data.tokens, set);
  },

  logout: async () => {
    const refreshToken = localStorage.getItem(ADMIN_REFRESH_KEY);
    try {
      if (refreshToken) {
        await adminLogout(refreshToken);
      }
    } finally {
      localStorage.removeItem(ADMIN_REFRESH_KEY);
      set({ accessToken: null, admin: null });
    }
  },
}));
