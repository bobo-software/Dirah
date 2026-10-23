import { create } from 'zustand';
import { adminLogin, adminLogout, adminMe, adminRefresh, type PublicSystemAdmin } from '../../api/admin';
import { accessTokenExpiresAt, ApiError } from '../../api/client';

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

/** Bumped on logout so a refresh that started earlier cannot revive the session. */
let adminSessionEpoch = 0;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshInflight: Promise<string> | null = null;

const REFRESH_LEAD_MS = 60_000;

function clearAdminRefresh(): void {
  adminSessionEpoch += 1;
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = null;
}

/** Refreshes the admin session shortly before the access token expires. */
function scheduleAdminRefresh(accessToken: string): void {
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = null;
  const expiresAt = accessTokenExpiresAt(accessToken);
  if (expiresAt === null) return;
  const epoch = adminSessionEpoch;
  const delay = Math.max(0, expiresAt - Date.now() - REFRESH_LEAD_MS);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    if (epoch !== adminSessionEpoch) return;
    void refreshAdminAccessToken().catch(() => undefined);
  }, delay);
}

async function performAdminRefresh(): Promise<string> {
  const epoch = adminSessionEpoch;
  try {
    const { tokens } = await adminRefresh();
    if (epoch !== adminSessionEpoch) throw new ApiError('Unauthorized', 401);
    useAdminAuthStore.setState({ accessToken: tokens.accessToken });
    scheduleAdminRefresh(tokens.accessToken);
    return tokens.accessToken;
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 400 || error.status === 401) &&
      epoch === adminSessionEpoch
    ) {
      clearAdminRefresh();
      // RequireSystemAdmin sends the admin to /admin/login. The user session is a separate store and stays.
      useAdminAuthStore.setState({ accessToken: null, admin: null });
    }
    throw error;
  }
}

/** One admin refresh at a time; the refresh cookie rotates, so parallel calls must share it. */
export function refreshAdminAccessToken(): Promise<string> {
  if (refreshInflight) return refreshInflight;
  const job = performAdminRefresh();
  refreshInflight = job;
  return job.finally(() => {
    if (refreshInflight === job) refreshInflight = null;
  });
}

function takeLegacyRefresh(): string | null {
  const existing = localStorage.getItem(ADMIN_REFRESH_KEY);
  if (existing) localStorage.removeItem(ADMIN_REFRESH_KEY);
  return existing;
}

async function applyAccess(accessToken: string, set: (partial: Partial<AdminAuthState>) => void) {
  set({ accessToken });
  scheduleAdminRefresh(accessToken);
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
          clearAdminRefresh();
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
    clearAdminRefresh();
    try {
      await adminLogout();
    } finally {
      localStorage.removeItem(ADMIN_REFRESH_KEY);
      set({ accessToken: null, admin: null });
    }
  },
}));
