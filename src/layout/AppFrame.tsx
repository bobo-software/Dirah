import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useSync } from '../sync/SyncProvider';

export function RequireAuth() {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <p className="muted">Loading…</p>;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export function AppFrame() {
  const { user, logout } = useAuth();
  const { status } = useSync();

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          Dira
        </Link>
        <nav className="topbar-nav">
          <NavLink to="/" end>
            Workspaces
          </NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <div className="topbar-user">
          <span className={`sync-status ${status}`}>{status}</span>
          <span className="topbar-email">{user?.email}</span>
          <button type="button" className="linkish" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
