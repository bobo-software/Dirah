import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAdminAuthStore } from '../../stores/StoresIndex';
import { AdminProfileMenu } from '../admin/AdminProfileMenu';
import { BrandLink } from './Logo';

export function RequireSystemAdmin() {
  const admin = useAdminAuthStore((state) => state.admin);
  const ready = useAdminAuthStore((state) => state.ready);
  const initAdminAuth = useAdminAuthStore((state) => state.initAdminAuth);
  const location = useLocation();

  useEffect(() => {
    void initAdminAuth();
  }, [initAdminAuth]);

  if (!ready) return <p className="muted">Loading…</p>;
  if (!admin) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export function AdminShell() {
  return (
    <div className="app">
      <header className="topbar">
        <BrandLink to="/admin" />
        <div className="topbar-workspace">
          <span className="admin-topbar-title">System admin</span>
        </div>
        <div className="topbar-user">
          <AdminProfileMenu />
        </div>
      </header>
      <div className="shell">
        <aside className="admin-sidebar">
          <nav className="admin-sidebar-nav" aria-label="System admin">
            <NavLink to="/admin" end>
              Overview
            </NavLink>
            <NavLink to="/admin/users">Users</NavLink>
            <NavLink to="/admin/emails">Emails</NavLink>
            <NavLink to="/admin/request-logs">API logs</NavLink>
          </nav>
        </aside>
        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
