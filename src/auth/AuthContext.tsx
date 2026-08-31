import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiRequest, type AuthTokens, type PublicUser, type PublicWorkspace } from '../api/client';

export const REFRESH_KEY = 'dira.refreshToken';

type AuthState = {
  user: PublicUser | null;
  accessToken: string | null;
  ready: boolean;
  error: string | null;
  register: (email: string, password: string) => Promise<PublicWorkspace>;
  acceptInvite: (token: string, password: string) => Promise<PublicWorkspace>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  listWorkspaces: () => Promise<PublicWorkspace[]>;
  createWorkspace: (name: string) => Promise<PublicWorkspace>;
  getWorkspace: (id: string) => Promise<PublicWorkspace>;
  renameWorkspace: (id: string, name: string) => Promise<PublicWorkspace>;
  deleteWorkspace: (id: string) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * Access token stays in memory. Refresh token is stored in localStorage
 * (`dira.refreshToken`) so a tab refresh can silently re-auth. Not httpOnly;
 * fine for local Phase 0, revisit if we move to cookie sessions.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyTokens = useCallback(async (tokens: AuthTokens) => {
    setAccessToken(tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    const { user: me } = await apiRequest<{ user: PublicUser }>('/api/auth/me', {
      accessToken: tokens.accessToken,
    });
    setUser(me);
  }, []);

  useEffect(() => {
    const existing = localStorage.getItem(REFRESH_KEY);
    if (!existing) {
      setReady(true);
      return;
    }
    void (async () => {
      try {
        const { tokens } = await apiRequest<{ tokens: AuthTokens }>('/api/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: existing }),
        });
        await applyTokens(tokens);
      } catch {
        localStorage.removeItem(REFRESH_KEY);
        setUser(null);
        setAccessToken(null);
      } finally {
        setReady(true);
      }
    })();
  }, [applyTokens]);

  const register = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const data = await apiRequest<{
        user: PublicUser;
        tokens: AuthTokens;
        workspace: PublicWorkspace;
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setAccessToken(data.tokens.accessToken);
      localStorage.setItem(REFRESH_KEY, data.tokens.refreshToken);
      setUser(data.user);
      return data.workspace;
    },
    []
  );

  const acceptInvite = useCallback(async (token: string, password: string) => {
    setError(null);
    const data = await apiRequest<{
      user: PublicUser;
      tokens: AuthTokens;
      workspace: PublicWorkspace;
    }>(`/api/invites/${token}/accept`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    setAccessToken(data.tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, data.tokens.refreshToken);
    setUser(data.user);
    return data.workspace;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    const data = await apiRequest<{ user: PublicUser; tokens: AuthTokens }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await applyTokens(data.tokens);
  }, [applyTokens]);

  const logout = useCallback(async () => {
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
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const listWorkspaces = useCallback(async () => {
    if (!accessToken) throw new Error('Not signed in');
    const data = await apiRequest<{ workspaces: PublicWorkspace[] }>('/api/workspaces', {
      accessToken,
    });
    return data.workspaces;
  }, [accessToken]);

  const createWorkspace = useCallback(
    async (name: string) => {
      if (!accessToken) throw new Error('Not signed in');
      const data = await apiRequest<{ workspace: PublicWorkspace }>('/api/workspaces', {
        method: 'POST',
        accessToken,
        body: JSON.stringify({ name }),
      });
      return data.workspace;
    },
    [accessToken]
  );

  const getWorkspace = useCallback(
    async (id: string) => {
      if (!accessToken) throw new Error('Not signed in');
      const data = await apiRequest<{ workspace: PublicWorkspace }>(`/api/workspaces/${id}`, {
        accessToken,
      });
      return data.workspace;
    },
    [accessToken]
  );

  const renameWorkspace = useCallback(
    async (id: string, name: string) => {
      if (!accessToken) throw new Error('Not signed in');
      const data = await apiRequest<{ workspace: PublicWorkspace }>(`/api/workspaces/${id}`, {
        method: 'PATCH',
        accessToken,
        body: JSON.stringify({ name }),
      });
      return data.workspace;
    },
    [accessToken]
  );

  const deleteWorkspace = useCallback(
    async (id: string) => {
      if (!accessToken) throw new Error('Not signed in');
      await apiRequest(`/api/workspaces/${id}`, {
        method: 'DELETE',
        accessToken,
      });
    },
    [accessToken]
  );

  const value = useMemo(
    () => ({
      user,
      accessToken,
      ready,
      error,
      register,
      acceptInvite,
      login,
      logout,
      listWorkspaces,
      createWorkspace,
      getWorkspace,
      renameWorkspace,
      deleteWorkspace,
    }),
    [
      user,
      accessToken,
      ready,
      error,
      register,
      acceptInvite,
      login,
      logout,
      listWorkspaces,
      createWorkspace,
      getWorkspace,
      renameWorkspace,
      deleteWorkspace,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
