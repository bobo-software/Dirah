import { type ReactNode, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { PublicWorkspace } from '../api/client';
import { Logo } from './Logo';

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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="2.8" />
      <path d="M19.2 14.6a1.5 1.5 0 0 0 .3 1.65l.05.05a1.8 1.8 0 1 1-2.55 2.55l-.05-.05a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.9 1.37V20a1.8 1.8 0 0 1-3.6 0v-.08a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.65.3l-.05.05a1.8 1.8 0 1 1-2.55-2.55l.05-.05a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.9H4a1.8 1.8 0 0 1 0-3.6h.08a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.65l-.05-.05A1.8 1.8 0 1 1 7.65 6.2l.05.05a1.5 1.5 0 0 0 1.65.3h.07a1.5 1.5 0 0 0 .9-1.37V5a1.8 1.8 0 0 1 3.6 0v.08a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.65-.3l.05-.05a1.8 1.8 0 1 1 2.55 2.55l-.05.05a1.5 1.5 0 0 0-.3 1.65v.07a1.5 1.5 0 0 0 1.37.9H20a1.8 1.8 0 0 1 0 3.6h-.08a1.5 1.5 0 0 0-1.37.9Z" />
    </svg>
  );
}

export default function Sidebar({
  workspace,
  open,
  narrow,
  onClose,
  children,
}: {
  workspace: PublicWorkspace | null;
  open: boolean;
  narrow: boolean;
  onClose: () => void;
  children?: ReactNode;
}) {
  const currentId = workspace?.id ?? '';

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
          <span className="sidebar-drawer-title">
            <Logo size="sm" decorative />
          </span>
          <button type="button" className="sidebar-close" onClick={onClose} aria-label="Close menu">
            <CloseIcon />
          </button>
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
