import { type ReactNode, useEffect, useState } from 'react';
import type { PublicWorkspace } from '../../api/client';
import { Logo } from './Logo';
import { Button } from '../buttons/Button';

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

export default function Sidebar({
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
  return (
    <>
      {open ? (
        <Button variant="plain" type="button" className="sidebar-backdrop" aria-label="Close sidebar" onClick={onClose} />
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
          <Button variant="plain" type="button" className="sidebar-close" onClick={onClose} aria-label="Close menu">
            <CloseIcon />
          </Button>
        </div>
        {children ? <div className="sidebar-body">{children}</div> : null}
      </aside>
    </>
  );
}
