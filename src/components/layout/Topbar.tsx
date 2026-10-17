import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useWorkspaceStore } from '../../stores/StoresIndex';
import { workspaceSection } from '../../pages/workspaceContext';
import { DocsIcon, NotesIcon, PlusIcon, TasksIcon, TicketsIcon } from './SectionIcons';
import { clearLastWorkspaceId, setLastWorkspaceId } from '../workspace/lastWorkspace';
import WorkspacesModal from '../workspace/WorkspacesModal';
import { Button } from '../buttons/Button';

export function TopbarWorkspaceSwitcher() {
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
        <Button variant="plain"
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
        </Button>
      ) : (
        <Button variant="plain" type="button" className="sidebar-empty-cta topbar-empty-cta" onClick={() => setOpen(true)}>
          <PlusIcon />
          New workspace
        </Button>
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

export function TopbarSectionTabs() {
  const { workspaceId } = useParams();
  const { pathname } = useLocation();
  const encrypted = useWorkspaceStore((state) =>
    state.workspaces.some((workspace) => workspace.id === workspaceId && workspace.encrypted)
  );
  if (!workspaceId) return null;
  const section = encrypted ? 'docs' : workspaceSection(pathname);

  return (
    <nav className="topbar-nav" aria-label="Workspace sections">
      <Link
        to={`/w/${workspaceId}/docs`}
        className={section === 'docs' ? 'topbar-tab active' : 'topbar-tab'}
        aria-current={section === 'docs' ? 'page' : undefined}
      >
        <DocsIcon />
        Docs
      </Link>
      {encrypted ? null : (
        <Link
          to={`/w/${workspaceId}`}
          className={section === 'notes' ? 'topbar-tab active' : 'topbar-tab'}
          aria-current={section === 'notes' ? 'page' : undefined}
        >
          <NotesIcon />
          Notes
        </Link>
      )}
      {encrypted ? null : (
        <Link
          to={`/w/${workspaceId}/tickets`}
          className={section === 'tickets' ? 'topbar-tab active' : 'topbar-tab'}
          aria-current={section === 'tickets' ? 'page' : undefined}
        >
          <TicketsIcon />
          Tickets
        </Link>
      )}
      {encrypted ? null : (
        <Link
          to={`/w/${workspaceId}/tasks`}
          className={section === 'tasks' ? 'topbar-tab active' : 'topbar-tab'}
          aria-current={section === 'tasks' ? 'page' : undefined}
        >
          <TasksIcon />
          Tasks
        </Link>
      )}
    </nav>
  );
}
