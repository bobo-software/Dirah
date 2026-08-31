import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ProfileMenu } from '../components/ProfileMenu';

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
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          Dira
        </Link>
        <div className="topbar-user">
          <ProfileMenu />
        </div>
      </header>
      <Outlet />
    </div>
  );
}
