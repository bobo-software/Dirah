import { useEffect, useRef, useState } from 'react';
import type { PublicMember } from '../../api/members';
import type { Ticket, TicketBoardView } from '../../api/tickets';
import { TicketViewer } from './viewer/TicketViewer';
import { Button } from '../buttons/Button';

const WIDE_KEY = 'dirah.ticketViewer.wide';

function readWide(): boolean {
  try {
    return window.localStorage.getItem(WIDE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeWide(value: boolean) {
  try {
    window.localStorage.setItem(WIDE_KEY, value ? '1' : '0');
  } catch {
    // Storage can be unavailable (private mode); the toggle still works for this session.
  }
}

/** Tickets in the order the table shows them: group by group, top to bottom. */
function boardOrder(view: TicketBoardView): Ticket[] {
  const groupRank = new Map([...view.groups].sort((a, b) => a.position - b.position).map((group, index) => [group.id, index]));
  return [...view.tickets].sort(
    (a, b) => (groupRank.get(a.groupId) ?? 0) - (groupRank.get(b.groupId) ?? 0) || a.position - b.position
  );
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

/** Drawer that hosts the ticket viewer over the board. */
export function TicketDetailPanel({
  view,
  ticketKey,
  members,
  editable,
  onSelect,
  onClose,
}: {
  view: TicketBoardView;
  ticketKey: string;
  members: PublicMember[];
  editable: boolean;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const [wide, setWide] = useState(readWide);
  const panelRef = useRef<HTMLElement>(null);
  const ordered = boardOrder(view);
  const index = ordered.findIndex((item) => item.key.toLowerCase() === ticketKey.toLowerCase());
  const ticket = index >= 0 ? ordered[index] : undefined;
  const previous = index > 0 ? ordered[index - 1] : undefined;
  const next = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : undefined;
  const keys = useRef({ previous, next, onSelect, onClose });

  useEffect(() => {
    keys.current = { previous, next, onSelect, onClose };
  });

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    panelRef.current?.scrollTo({ top: 0 });
  }, [ticket?.id]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      // Leave keys alone while a menu, picker or dialog is open on top of the panel.
      if (document.querySelector('.note-col-menu, .lightbox, .modal-backdrop')) return;
      const { previous: prev, next: nxt } = keys.current;
      if (event.key === 'Escape') keys.current.onClose();
      else if ((event.key === 'j' || event.key === 'J') && nxt) keys.current.onSelect(nxt.key);
      else if ((event.key === 'k' || event.key === 'K') && prev) keys.current.onSelect(prev.key);
      else return;
      event.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="ticket-panel-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside
        ref={panelRef}
        className={wide ? 'ticket-panel is-wide' : 'ticket-panel'}
        role="dialog"
        aria-modal="true"
        aria-label={ticket ? `${ticket.key} ${ticket.title}` : 'Ticket'}
        tabIndex={-1}
      >
        {ticket ? (
          <TicketViewer
            key={ticket.id}
            view={view}
            ticket={ticket}
            members={members}
            editable={editable}
            wide={wide}
            previous={previous}
            next={next}
            onNavigate={(target) => onSelect(target.key)}
            onToggleWide={() =>
              setWide((value) => {
                writeWide(!value);
                return !value;
              })
            }
            onClose={onClose}
          />
        ) : (
          <div className="ticket-viewer-missing">
            <p className="ticket-viewer-heading">{ticketKey}</p>
            <p className="muted">This ticket isn’t on this board. It may have been deleted or moved.</p>
            <Button type="button" onClick={onClose}>
              Back to the board
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}
