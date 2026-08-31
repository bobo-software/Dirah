import { type ReactNode, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { PublicWorkspace } from '../api/client';

export function useSidebarDrawer() {
  const [open, setOpen] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 767px)').matches);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setNarrow(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return { open, setOpen, narrow };
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </svg>
  );
}

function CollectionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 7h15" />
      <path d="M9.5 7V4.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25V7" />
      <path d="M6.5 7.5l.9 12.15a1.5 1.5 0 0 0 1.5 1.35h6.2a1.5 1.5 0 0 0 1.5-1.35l.9-12.15" />
      <path d="M10.2 11v6.2" />
      <path d="M13.8 11v6.2" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="7.5" strokeDasharray="2.2 3.4" />
    </svg>
  );
}

export default function Sidebar({
  workspaces,
  workspace,
  open,
  narrow,
  manageOpen,
  onClose,
  onOpenWorkspaces,
  children,
}: {
  workspaces: PublicWorkspace[];
  workspace: PublicWorkspace | null;
  open: boolean;
  narrow: boolean;
  manageOpen: boolean;
  onClose: () => void;
  onOpenWorkspaces: () => void;
  children?: ReactNode;
}) {
  const currentId = workspace?.id ?? '';
  const initial = (workspace?.name ?? '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <>
      {open ? (
        <button type="button" className="sidebar-backdrop" aria-label="Close sidebar" onClick={onClose} />
      ) : null}
      <aside
        className={open ? 'sidebar open' : 'sidebar'}
        id="workspace-sidebar"
        inert={narrow && !open ? true : undefined}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) onClose();
        }}
      >
        <div className="sidebar-drawer-head">
          <span className="sidebar-drawer-title">Menu</span>
          <button type="button" className="sidebar-close" onClick={onClose} aria-label="Close menu">
            <CloseIcon />
          </button>
        </div>
        <div className="sidebar-workspace">
          {workspaces.length > 0 ? (
            <button
              type="button"
              className="workspace-switcher"
              aria-haspopup="dialog"
              aria-expanded={manageOpen}
              title="Manage workspaces"
              onClick={onOpenWorkspaces}
            >
              <span className="workspace-avatar" aria-hidden="true">
                {initial}
              </span>
              <span className="workspace-switcher-name">{workspace?.name ?? 'Workspaces'}</span>
              <span className="workspace-switcher-caret" aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="sidebar-empty-cta" onClick={onOpenWorkspaces}>
              <PlusIcon />
              New workspace
            </button>
          )}
          {workspace ? (
            <p className="sidebar-workspace-meta">
              <span className="role-badge">{workspace.role}</span>
            </p>
          ) : null}
        </div>
        {children ? <div className="sidebar-body">{children}</div> : null}
        {currentId ? (
          <nav className="sidebar-nav">
            <NavLink to={`/w/${currentId}/collection`}>
              <CollectionIcon />
              <span>Collection</span>
            </NavLink>
            <NavLink to={`/w/${currentId}/trash`}>
              <TrashIcon />
              <span>Trash</span>
            </NavLink>
            <NavLink to={`/w/${currentId}/settings`}>
              <SettingsIcon />
              <span>Settings</span>
            </NavLink>
          </nav>
        ) : null}
      </aside>
    </>
  );
}
