import { type ReactNode, useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore, useWorkspaceStore } from '../../stores/StoresIndex';
import { ProfileMenu } from '../auth/ProfileMenu';
import { BrandLink } from './Logo';
import { TopbarSectionTabs, TopbarWorkspaceSwitcher } from './Topbar';

export function RequireAuth() {
  const user = useAuthStore((state) => state.user);
  const ready = useAuthStore((state) => state.ready);
  const location = useLocation();

  if (!ready) return <p className="muted">Loading…</p>;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
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
