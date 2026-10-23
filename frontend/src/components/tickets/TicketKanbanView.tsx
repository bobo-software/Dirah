import { useEffect, useState, type DragEvent } from 'react';
import type { PublicMember } from '../../api/members';
import type { Ticket, TicketBoardView } from '../../api/tickets';
import { useTicketStore } from '../../stores/StoresIndex';
import { Avatar } from './TicketMenus';
import { dueTone, formatDue, isFiltering, matchesFilter, PRIORITY_META, type TicketFilters } from './ticketMeta';
import { Button } from '../buttons/Button';

const CARD_DRAG = 'text/ticket-card';

type Drop = { statusId: string; targetId: string | null; after: boolean };

function insertionIndex(tickets: Ticket[], draggedId: string, targetId: string | null, after: boolean): number {
  const without = tickets.filter((ticket) => ticket.id !== draggedId);
  if (!targetId) return without.length;
  const target = without.findIndex((ticket) => ticket.id === targetId);
  if (target < 0) return without.length;
  return target + (after ? 1 : 0);
}

export function TicketKanbanView({
  view,
  members,
  editable,
  filters,
  onOpen,
  onAdd,
  onError,
}: {
  view: TicketBoardView;
  members: PublicMember[];
  editable: boolean;
  filters: TicketFilters;
  onOpen: (ticket: Ticket) => void;
  onAdd: (defaults: { statusId: string }) => void;
  onError: (message: string) => void;
}) {
  const moveTicket = useTicketStore((state) => state.moveTicket);
  const setDragging = useTicketStore((state) => state.setDragging);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const boardId = view.board.id;

  // A drag cut short by unmounting must not leave polling paused.
  useEffect(() => () => setDragging(boardId, false), [boardId, setDragging]);
  const canDrag = editable && !isFiltering(filters);
  const statuses = [...view.statuses]
    .filter((status) => !filters.statusIds.length || filters.statusIds.includes(status.id))
    .sort((a, b) => a.position - b.position);
  const doneIds = new Set(view.statuses.filter((status) => status.category === 'done').map((status) => status.id));
  const byId = new Map(members.map((member) => [member.userId, member]));

  function ticketsIn(statusId: string): Ticket[] {
    return view.tickets
      .filter((ticket) => ticket.statusId === statusId)
      .sort((a, b) => a.statusPosition - b.statusPosition);
  }

  function onDrop(event: DragEvent, statusId: string) {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData(CARD_DRAG) || dragId;
    const target = drop?.statusId === statusId ? drop : { statusId, targetId: null, after: true };
    setDrop(null);
    setDragId(null);
    setDragging(boardId, false);
    if (!draggedId) return;
    const column = ticketsIn(statusId);
    const statusPosition = insertionIndex(column, draggedId, target.targetId, target.after);
    if (column.findIndex((ticket) => ticket.id === draggedId) === statusPosition) return;
    moveTicket(boardId, draggedId, { statusId, statusPosition }).catch((error: unknown) =>
      onError(error instanceof Error ? error.message : 'Could not move the ticket')
    );
  }

  return (
    <div className={`kanban-board ticket-kanban${dragId ? ' is-dragging' : ''}`}>
      {statuses.map((status) => {
        const all = ticketsIn(status.id);
        const cards = all.filter((ticket) => matchesFilter(ticket, filters, doneIds));
        const columnDrop = drop?.statusId === status.id && drop.targetId === null;
        return (
          <section
            key={status.id}
            className={`kanban-column ticket-kanban-column${columnDrop ? ' drop-card' : ''}`}
            aria-label={status.name}
            onDragOver={(event) => {
              if (!canDrag || !event.dataTransfer.types.includes(CARD_DRAG)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              if (!(event.target as HTMLElement).closest('.ticket-card')) {
                setDrop({ statusId: status.id, targetId: null, after: true });
              }
            }}
            onDrop={(event) => {
              if (canDrag && event.dataTransfer.types.includes(CARD_DRAG)) onDrop(event, status.id);
            }}
          >
            <header className="ticket-kanban-head">
              <span className={`ticket-pill note-type-${status.color}`}>{status.name}</span>
              <span className="ticket-group-count">{all.length}</span>
            </header>
            <div className="ticket-kanban-cards">
              {cards.map((ticket) => {
                const isDrop = drop?.targetId === ticket.id;
                const dropClass = isDrop ? (drop.after ? ' drop-after' : ' drop-before') : '';
                const tone = dueTone(ticket.dueDate, status.category === 'done');
                return (
                  <article
                    key={ticket.id}
                    className={`ticket-card${dragId === ticket.id ? ' dragging' : ''}${dropClass}`}
                    draggable={canDrag}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(CARD_DRAG, ticket.id);
                      event.dataTransfer.effectAllowed = 'move';
                      setDragId(ticket.id);
                      setDragging(boardId, true);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDragging(boardId, false);
                      setDrop(null);
                    }}
                    onDragOver={(event) => {
                      if (!canDrag || !event.dataTransfer.types.includes(CARD_DRAG)) return;
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      const after = event.clientY > rect.top + rect.height / 2;
                      if (drop?.targetId !== ticket.id || drop.after !== after) {
                        setDrop({ statusId: status.id, targetId: ticket.id, after });
                      }
                    }}
                  >
                    <Button variant="plain" type="button" className="ticket-card-open" onClick={() => onOpen(ticket)}>
                      <span className="ticket-card-title">{ticket.title}</span>
                    </Button>
                    {ticket.labels.length > 0 ? (
                      <div className="ticket-card-labels">
                        {ticket.labels.map((label) => (
                          <span key={label} className="ticket-label">
                            {label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <footer className="ticket-card-foot">
                      {ticket.priority !== 'none' ? (
                        <span className={`ticket-pill ticket-pill-soft note-type-${PRIORITY_META[ticket.priority].color}`}>
                          {PRIORITY_META[ticket.priority].label}
                        </span>
                      ) : null}
                      {ticket.dueDate ? <span className={`ticket-due ${tone}`}>{formatDue(ticket.dueDate)}</span> : null}
                      <span className="ticket-avatar-stack">
                        {ticket.assigneeIds.slice(0, 3).map((id) => (
                          <Avatar key={id} member={byId.get(id)} />
                        ))}
                      </span>
                    </footer>
                  </article>
                );
              })}
            </div>
            {editable ? (
              <Button variant="plain" type="button" className="ticket-kanban-add" onClick={() => onAdd({ statusId: status.id })}>
                + Add ticket
              </Button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
