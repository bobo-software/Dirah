import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Ticket, TicketBoardView } from '../../../api/tickets';
import { placeFloatingMenu } from '../../notes/table/placeFloatingMenu';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, CollapseIcon, ExpandIcon, LinkIcon, MoreIcon } from './ViewerIcons';
import { Button } from '../../buttons/Button';

export function TicketViewerHeader({
  view,
  ticket,
  editable,
  previous,
  next,
  wide,
  onNavigate,
  onToggleWide,
  onDelete,
  onClose,
}: {
  view: TicketBoardView;
  ticket: Ticket;
  editable: boolean;
  previous?: Ticket;
  next?: Ticket;
  wide?: boolean;
  onNavigate?: (ticket: Ticket) => void;
  onToggleWide?: () => void;
  onDelete: () => void;
  onClose?: () => void;
}) {
  const group = view.groups.find((item) => item.id === ticket.groupId);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 1600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(done);
    } catch {
      setNotice('Couldn’t copy');
    }
  }

  const link = (() => {
    const url = new URL(window.location.href);
    url.searchParams.set('ticket', ticket.key);
    return url.toString();
  })();

  return (
    <header className="ticket-viewer-bar">
      <nav className="ticket-viewer-crumbs" aria-label="Ticket location">
        <span className="ticket-viewer-crumb">{view.board.name}</span>
        {group ? (
          <>
            <span className="ticket-viewer-crumb-sep" aria-hidden="true">
              /
            </span>
            <span className={`ticket-viewer-crumb note-type-${group.color}`}>
              <span className="ticket-viewer-crumb-dot" aria-hidden="true" />
              {group.name}
            </span>
          </>
        ) : null}
        <span className="ticket-viewer-crumb-sep" aria-hidden="true">
          /
        </span>
        <Button variant="plain"
          type="button"
          className="ticket-viewer-key"
          title="Copy ticket key"
          onClick={() => void copy(ticket.key, `Copied ${ticket.key}`)}
        >
          {ticket.key}
        </Button>
      </nav>
      <div className="ticket-viewer-tools">
        {notice ? (
          <span className="ticket-viewer-notice" role="status">
            {notice}
          </span>
        ) : null}
        {onNavigate ? (
          <>
            <Button variant="plain"
              type="button"
              className="ticket-viewer-tool"
              aria-label="Previous ticket"
              title="Previous ticket (K)"
              disabled={!previous}
              onClick={() => previous && onNavigate(previous)}
            >
              <ChevronUpIcon />
            </Button>
            <Button variant="plain"
              type="button"
              className="ticket-viewer-tool"
              aria-label="Next ticket"
              title="Next ticket (J)"
              disabled={!next}
              onClick={() => next && onNavigate(next)}
            >
              <ChevronDownIcon />
            </Button>
            <span className="ticket-viewer-divider" aria-hidden="true" />
          </>
        ) : null}
        <Button variant="plain"
          type="button"
          className="ticket-viewer-tool"
          aria-label="Copy link"
          title="Copy link"
          onClick={() => void copy(link, 'Link copied')}
        >
          <LinkIcon />
        </Button>
        {onToggleWide ? (
          <Button variant="plain"
            type="button"
            className="ticket-viewer-tool"
            aria-label={wide ? 'Narrow view' : 'Wide view'}
            title={wide ? 'Narrow view' : 'Wide view'}
            onClick={onToggleWide}
          >
            {wide ? <CollapseIcon /> : <ExpandIcon />}
          </Button>
        ) : null}
        <Button variant="plain"
          type="button"
          className="ticket-viewer-tool"
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={Boolean(menuAnchor)}
          onClick={(event) => setMenuAnchor(menuAnchor ? null : event.currentTarget)}
        >
          <MoreIcon />
        </Button>
        {onClose ? (
          <Button variant="plain" type="button" className="ticket-viewer-tool" aria-label="Close" title="Close (Esc)" onClick={onClose}>
            <CloseIcon />
          </Button>
        ) : null}
      </div>
      {menuAnchor ? (
        <MoreMenu
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          items={[
            { label: 'Copy link', onSelect: () => void copy(link, 'Link copied') },
            { label: `Copy key (${ticket.key})`, onSelect: () => void copy(ticket.key, `Copied ${ticket.key}`) },
            { label: 'Copy as markdown link', onSelect: () => void copy(`[${ticket.key} ${ticket.title}](${link})`, 'Markdown copied') },
            ...(editable ? [{ label: 'Delete ticket', danger: true, onSelect: onDelete }] : []),
          ]}
        />
      ) : null}
    </header>
  );
}

function MoreMenu({
  anchor,
  items,
  onClose,
}: {
  anchor: HTMLElement;
  items: { label: string; danger?: boolean; onSelect: () => void }[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    placeFloatingMenu(menu, anchor);
    // Right-align under the trigger so the menu stays inside the panel.
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(8, rect.right - menu.offsetWidth)}px`;
  });

  useEffect(() => {
    const onPointerDown = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div ref={menuRef} className="note-col-menu ticket-menu" role="menu">
      {items.map((item) => (
        <Button variant="plain"
          key={item.label}
          type="button"
          role="menuitem"
          className={item.danger ? 'ticket-menu-row ticket-menu-danger' : 'ticket-menu-row'}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </Button>
      ))}
    </div>,
    document.body
  );
}
