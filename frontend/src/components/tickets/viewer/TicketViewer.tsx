import { useState } from 'react';
import type { PublicMember } from '../../../api/members';
import type { Ticket, TicketBoardView, TicketPatch } from '../../../api/tickets';
import { useTicketStore } from '../../../stores/StoresIndex';
import { confirmDelete } from '../../layout/deleteDialogue';
import { TicketDescription, TicketProperties, TicketTitle } from './TicketFields';
import { TicketUpdates } from './TicketUpdates';
import { TicketViewerHeader } from './TicketViewerHeader';
import { useTicketDetail } from './useTicketDetail';
import { Button } from '../../buttons/Button';

/**
 * Everything about one ticket: header actions, title, properties, description
 * and updates. Host it in a drawer, a modal or a full page; `wide` switches to
 * a two-column layout with properties on the right.
 */
export function TicketViewer({
  view,
  ticket,
  members,
  editable,
  wide = false,
  previous,
  next,
  onNavigate,
  onToggleWide,
  onClose,
  onDeleted,
}: {
  view: TicketBoardView;
  ticket: Ticket;
  members: PublicMember[];
  editable: boolean;
  wide?: boolean;
  previous?: Ticket;
  next?: Ticket;
  onNavigate?: (ticket: Ticket) => void;
  onToggleWide?: () => void;
  onClose?: () => void;
  onDeleted?: () => void;
}) {
  const patchTicket = useTicketStore((state) => state.patchTicket);
  const deleteTicket = useTicketStore((state) => state.deleteTicket);
  const detail = useTicketDetail(ticket.id, ticket.updatedAt);
  const [error, setError] = useState<string | null>(null);
  const boardId = view.board.id;

  async function patch(input: TicketPatch) {
    setError(null);
    try {
      await patchTicket(boardId, ticket.id, input);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the ticket');
    }
  }

  async function remove() {
    const ok = await confirmDelete({
      title: `Delete ${ticket.key}?`,
      message: `“${ticket.title}” and its comments will be removed from the board.`,
      confirmLabel: 'Delete ticket',
    });
    if (!ok) return;
    try {
      await deleteTicket(boardId, ticket.id);
      (onDeleted ?? onClose)?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the ticket');
    }
  }

  const shownError = error ?? detail.error;

  return (
    <article className={wide ? 'ticket-viewer is-wide' : 'ticket-viewer'} aria-label={`${ticket.key} ${ticket.title}`}>
      <TicketViewerHeader
        view={view}
        ticket={ticket}
        editable={editable}
        previous={previous}
        next={next}
        wide={wide}
        onNavigate={onNavigate}
        onToggleWide={onToggleWide}
        onDelete={() => void remove()}
        onClose={onClose}
      />
      <div className="ticket-viewer-grid">
        <div className="ticket-viewer-head">
          <TicketTitle key={ticket.title} title={ticket.title} editable={editable} onSave={(title) => void patch({ title })} />
          {shownError ? (
            <p className="error ticket-viewer-error" role="alert">
              {shownError}{' '}
              <Button variant="link" type="button" onClick={() => setError(null)}>
                Dismiss
              </Button>
            </p>
          ) : null}
        </div>
        <TicketProperties view={view} ticket={ticket} members={members} editable={editable} onPatch={(input) => void patch(input)} />
        <TicketDescription
          workspaceId={view.board.workspaceId}
          description={ticket.description}
          editable={editable}
          onSave={(description) => patch({ description })}
        />
        <TicketUpdates
          workspaceId={view.board.workspaceId}
          ticketId={ticket.id}
          members={members}
          editable={editable}
          loaded={detail.loaded}
          comments={detail.comments}
          activity={detail.activity}
          onComments={detail.updateComments}
          onError={setError}
        />
      </div>
    </article>
  );
}
