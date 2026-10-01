import { type ReactNode, useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuthStore, useWorkspaceStore } from '../stores/StoresIndex';
import { BrandLink } from '../components/Logo';
import { ProfileMenu } from '../components/ProfileMenu';
import { WorkspacesModal } from '../components/ComponentsIndex';
import { clearLastWorkspaceId, setLastWorkspaceId } from '../components/lastWorkspace';

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

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TopbarWorkspaceSwitcher() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const [open, setOpen] = useState(false);
  const workspace = workspaces.find((item) => item.id === workspaceId);
  const initial = (workspace?.name ?? '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="topbar-workspace">
      {workspaces.length > 0 ? (
        <button
          type="button"
          className="workspace-switcher"
          aria-haspopup="dialog"
          aria-expanded={open}
          title="Manage workspaces"
          onClick={() => setOpen(true)}
        >
          <span className="workspace-avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="workspace-switcher-name">{workspace?.name ?? 'Workspaces'}</span>
          {workspace?.encrypted ? <span className="kind-chip">Encrypted</span> : null}
          <span className="workspace-switcher-caret" aria-hidden="true" />
        </button>
      ) : (
        <button type="button" className="sidebar-empty-cta topbar-empty-cta" onClick={() => setOpen(true)}>
          <PlusIcon />
          New workspace
        </button>
      )}
      <WorkspacesModal
        open={open}
        onClose={() => setOpen(false)}
        currentId={workspaceId ?? ''}
        onSelect={(id) => {
          setLastWorkspaceId(id);
          const stayOnSettings = /\/settings\/?$/.test(location.pathname);
          navigate(stayOnSettings ? `/w/${id}/settings` : `/w/${id}`);
        }}
        onCreated={(created) => {
          setLastWorkspaceId(created.id);
          navigate(`/w/${created.id}`);
        }}
        onDeleted={(id) => {
          if (workspaceId !== id) return;
          const remaining = useWorkspaceStore.getState().workspaces;
          const next = remaining[0];
          if (next) {
            setLastWorkspaceId(next.id);
            navigate(`/w/${next.id}`);
            return;
          }
          clearLastWorkspaceId();
          navigate('/');
        }}
      />
    </div>
  );
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
        <div className="topbar-user">
          <ProfileMenu />
        </div>
      </header>
      {children ?? <Outlet />}
    </div>
  );
}
