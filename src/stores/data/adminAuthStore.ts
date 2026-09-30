import { create } from 'zustand';
import { adminLogin, adminLogout, adminMe, adminRefresh, type PublicSystemAdmin } from '../../api/admin';

export const ADMIN_REFRESH_KEY = 'dirah.admin.refreshToken';

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

function takeLegacyRefresh(): string | null {
  const existing = localStorage.getItem(ADMIN_REFRESH_KEY);
  if (existing) localStorage.removeItem(ADMIN_REFRESH_KEY);
  return existing;
}

async function applyAccess(accessToken: string, set: (partial: Partial<AdminAuthState>) => void) {
  set({ accessToken });
  const { admin } = await adminMe(accessToken);
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
        const legacy = takeLegacyRefresh();
        try {
          const { tokens } = await adminRefresh(legacy ?? undefined);
          await applyAccess(tokens.accessToken, set);
        } catch {
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
    localStorage.removeItem(ADMIN_REFRESH_KEY);
    await applyAccess(data.tokens.accessToken, set);
  },

  logout: async () => {
    try {
      await adminLogout();
    } finally {
      localStorage.removeItem(ADMIN_REFRESH_KEY);
      set({ accessToken: null, admin: null });
    }
  },
}));
