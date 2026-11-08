import { type ReactNode, useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore, useWorkspaceStore } from '../../stores/StoresIndex';
import { clearReturnTo, rememberReturnTo } from '../../utils/returnTo';
import { ProfileMenu } from '../auth/ProfileMenu';
import { BrandLink } from './Logo';
import { TopbarSectionTabs, TopbarWorkspaceSwitcher } from './Topbar';
import { APP_META, Seo } from '../../seo/index';

export function RequireAuth() {
  const user = useAuthStore((state) => state.user);
  const ready = useAuthStore((state) => state.ready);
  const location = useLocation();

  useEffect(() => {
    if (user) clearReturnTo();
  }, [user]);

  if (!ready) return <p className="muted">Loading…</p>;
  if (!user) {
    // Keep the query string: the MCP OAuth consent page carries the whole request in it.
    const from = location.pathname + location.search;
    rememberReturnTo(from);
    return <Navigate to="/login" replace state={{ from }} />;
  }
  return <Outlet />;
}

export function AppFrame({ children }: { children?: ReactNode }) {
  const fetchWorkspaces = useWorkspaceStore((state) => state.fetchWorkspaces);

  useEffect(() => {
    void fetchWorkspaces().catch(() => undefined);
  }, [fetchWorkspaces]);

  return (
    <div className="app">
      {/* Everything behind the sign-in wall is private: keep it out of the index. */}
      <Seo {...APP_META} />
      <header className="topbar">
        <BrandLink />
        <TopbarWorkspaceSwitcher />
        <TopbarSectionTabs />
        <div className="topbar-user">
          <ProfileMenu />
        </div>
      </header>
      {children ?? <Outlet />}
    </div>
  );
}
