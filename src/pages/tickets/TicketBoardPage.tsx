import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import type { Ticket } from '../../api/tickets';
import { Button } from '../../components/buttons/Button';
import { SettingsIcon } from '../../components/layout/SectionIcons';
import { BoardSettingsModal } from '../../components/tickets/BoardModals';
import { CreateTicketModal, type NewTicketDefaults } from '../../components/tickets/CreateTicketModal';
import { TicketDetailPanel } from '../../components/tickets/TicketDetailPanel';
import { TicketKanbanView } from '../../components/tickets/TicketKanbanView';
import { TicketTableView } from '../../components/tickets/TicketTableView';
import { EMPTY_MEMBERS, useMembersStore, useTicketStore, useWorkspaceStore } from '../../stores/StoresIndex';
import { canEdit, type WorkspaceOutlet } from '../workspaceContext';

type BoardViewMode = 'table' | 'kanban';

export function TicketBoardPage() {
  const { workspaceId = '', boardId = '' } = useParams();
  const { role } = useOutletContext<WorkspaceOutlet>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const workspace = useWorkspaceStore((state) => state.workspaces.find((item) => item.id === workspaceId));
  const view = useTicketStore((state) => state.views[boardId]);
  const fetchBoard = useTicketStore((state) => state.fetchBoard);
  const members = useMembersStore((state) => state.byWorkspace[workspaceId]?.members ?? EMPTY_MEMBERS);
  const fetchMembers = useMembersStore((state) => state.fetchMembers);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ boardId: string; message: string } | null>(null);
  const [filter, setFilter] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creating, setCreating] = useState<NewTicketDefaults | null>(null);
  const editable = canEdit(role);
  const mode: BoardViewMode = params.get('view') === 'kanban' ? 'kanban' : 'table';
  const openKey = params.get('ticket');

  useEffect(() => {
    void fetchBoard(boardId).catch((err: unknown) =>
      setLoadError({ boardId, message: err instanceof Error ? err.message : 'Could not load the board' })
    );
  }, [boardId, fetchBoard]);

  useEffect(() => {
    void fetchMembers(workspaceId).catch(() => undefined);
  }, [workspaceId, fetchMembers]);

  if (workspace?.encrypted) {
    return <Navigate to={`/w/${workspaceId}/docs`} replace />;
  }

  function setParam(name: string, value: string | null) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(name, value);
        else next.delete(name);
        return next;
      },
      { replace: name === 'view' }
    );
  }

  const open = (ticket: Ticket) => setParam('ticket', ticket.key);

  if (!view) {
    return (
      <div className="home-landing">
        {loadError?.boardId === boardId ? (
          <p className="error" role="alert">
            {loadError.message}
          </p>
        ) : (
          <p className="muted">Loading board…</p>
        )}
      </div>
    );
  }

  return (
    <div className="ticket-board-page">
      <header className="ticket-board-head">
        <div className="ticket-board-title">
          <span className="ticket-board-key">{view.board.key}</span>
          <h1>{view.board.name}</h1>
          {view.board.description ? <p className="muted">{view.board.description}</p> : null}
        </div>
        <div className="ticket-board-tools">
          <div className="ticket-view-toggle" role="tablist" aria-label="Board view">
            <Button
              role="tab"
              aria-selected={mode === 'table'}
              className={mode === 'table' ? 'ticket-view-btn on' : 'ticket-view-btn'}
              onClick={() => setParam('view', null)}
            >
              Table
            </Button>
            <Button
              role="tab"
              aria-selected={mode === 'kanban'}
              className={mode === 'kanban' ? 'ticket-view-btn on' : 'ticket-view-btn'}
              onClick={() => setParam('view', 'kanban')}
            >
              Kanban
            </Button>
          </div>
          <input
            type="search"
            className="ticket-filter"
            placeholder="Filter tickets"
            aria-label="Filter tickets"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          {editable ? <Button onClick={() => setCreating({})}>New ticket</Button> : null}
          {editable ? (
            <Button variant="icon" className="ticket-settings-btn" aria-label="Settings" title="Settings" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon />
            </Button>
          ) : null}
        </div>
      </header>
      {error ? (
        <p className="error ticket-board-error" role="alert">
          {error}{' '}
          <Button variant="link" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </p>
      ) : null}
      <div className={mode === 'kanban' ? 'ticket-board-body kanban' : 'ticket-board-body'}>
        {mode === 'kanban' ? (
          <TicketKanbanView view={view} members={members} editable={editable} filter={filter} onOpen={open} onAdd={setCreating} onError={setError} />
        ) : (
          <TicketTableView view={view} members={members} editable={editable} filter={filter} onOpen={open} onAdd={setCreating} onError={setError} />
        )}
      </div>
      {openKey ? (
        <TicketDetailPanel
          view={view}
          ticketKey={openKey}
          members={members}
          editable={editable}
          onSelect={(key) => setParam('ticket', key)}
          onClose={() => setParam('ticket', null)}
        />
      ) : null}
      {creating ? (
        <CreateTicketModal
          view={view}
          members={members}
          defaults={creating}
          onClose={() => setCreating(null)}
          onCreated={() => setCreating(null)}
        />
      ) : null}
      {settingsOpen ? (
        <BoardSettingsModal
          view={view}
          onClose={() => setSettingsOpen(false)}
          onDeleted={() => navigate(`/w/${workspaceId}/tickets`, { replace: true })}
        />
      ) : null}
    </div>
  );
}
