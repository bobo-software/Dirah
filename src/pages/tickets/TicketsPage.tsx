import { type CSSProperties, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { searchTickets, type TicketSearchResult } from '../../api/tickets';
import { categoryHue } from '../../components/docs/categoryColor';
import { CreateBoardModal } from '../../components/tickets/BoardModals';
import { dueTone, formatDue, PRIORITY_META } from '../../components/tickets/ticketMeta';
import { EMPTY_TICKET_BOARDS, useAuthStore, useTicketStore, useWorkspaceStore } from '../../stores/StoresIndex';
import { canEdit, type WorkspaceOutlet } from '../workspaceContext';

export function TicketsPage() {
  const { workspaceId = '' } = useParams();
  const { role } = useOutletContext<WorkspaceOutlet>();
  const navigate = useNavigate();
  const workspace = useWorkspaceStore((state) => state.workspaces.find((item) => item.id === workspaceId));
  const boards = useTicketStore((state) => state.byWorkspace[workspaceId] ?? EMPTY_TICKET_BOARDS);
  const loaded = useTicketStore((state) => state.loadedWorkspaces.has(workspaceId));
  const accessToken = useAuthStore((state) => state.accessToken);
  const [mine, setMine] = useState<TicketSearchResult[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = canEdit(role);

  useEffect(() => {
    if (!accessToken || workspace?.encrypted) return;
    let cancelled = false;
    searchTickets(accessToken, workspaceId, { assignee: 'me', state: 'open' }).then(
      (tickets) => !cancelled && setMine(tickets),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load your tickets')
    );
    return () => {
      cancelled = true;
    };
  }, [accessToken, workspaceId, workspace?.encrypted]);

  if (workspace?.encrypted) {
    return <Navigate to={`/w/${workspaceId}/docs`} replace />;
  }

  const ticketHref = (ticket: TicketSearchResult) =>
    `/w/${workspaceId}/tickets/${ticket.boardId}?ticket=${encodeURIComponent(ticket.key)}`;

  return (
    <div className="home-landing">
      <h1 className="home-landing-title">Tickets</h1>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="notes-home" aria-label="Assigned to me">
        <div className="notes-home-head">
          <h2 className="ticket-home-heading">Assigned to me</h2>
        </div>
        {mine === null ? (
          <p className="muted">Loading…</p>
        ) : mine.length === 0 ? (
          <p className="muted home-empty-state">Nothing open is assigned to you.</p>
        ) : (
          <ul className="ticket-mine">
            {mine.map((ticket) => {
              const tone = dueTone(ticket.dueDate, false);
              return (
                <li key={ticket.id}>
                  <Link to={ticketHref(ticket)} className="ticket-mine-row">
                    <span className="ticket-key">{ticket.key}</span>
                    <span className="ticket-mine-title">{ticket.title}</span>
                    <span className="ticket-mine-board muted">{ticket.boardName}</span>
                    <span className={`ticket-pill note-type-${ticket.statusColor}`}>{ticket.statusName}</span>
                    {ticket.priority !== 'none' ? (
                      <span className={`ticket-pill ticket-pill-soft note-type-${PRIORITY_META[ticket.priority].color}`}>
                        {PRIORITY_META[ticket.priority].label}
                      </span>
                    ) : null}
                    {ticket.dueDate ? <span className={`ticket-due ${tone}`}>{formatDue(ticket.dueDate)}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="notes-home" aria-label="Boards">
        <div className="notes-home-head">
          <h2 className="ticket-home-heading">Boards</h2>
          {editable ? (
            <button type="button" onClick={() => setCreating(true)}>
              New board
            </button>
          ) : null}
        </div>
        {!loaded ? (
          <p className="muted">Loading boards…</p>
        ) : boards.length === 0 ? (
          <p className="muted home-empty-state">
            No boards yet. A board holds tickets with a status, owner and due date. Try one per team or project.
          </p>
        ) : (
          <div className="docs-grid task-grid">
            {boards.map((board) => {
              const cardStyle = { '--card-hue': categoryHue(board.id) } as CSSProperties;
              return (
                <div key={board.id} className="doc-card task-list-card" style={cardStyle}>
                  <Link to={`/w/${workspaceId}/tickets/${board.id}`} className="doc-card-link">
                    <div className="doc-card-meta">
                      <span>{board.key}</span>
                    </div>
                    <h3 className="doc-card-title">{board.name}</h3>
                    <p className="task-card-count">
                      {board.openCount} open · {board.ticketCount} total
                    </p>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {creating ? (
        <CreateBoardModal
          workspaceId={workspaceId}
          onClose={() => setCreating(false)}
          onCreated={(view) => navigate(`/w/${workspaceId}/tickets/${view.board.id}`)}
        />
      ) : null}
    </div>
  );
}
