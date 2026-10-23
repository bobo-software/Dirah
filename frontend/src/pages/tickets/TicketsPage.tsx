import { useState } from 'react';
import { Navigate, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { CreateBoardModal } from '../../components/tickets/BoardModals';
import { EMPTY_TICKET_BOARDS, useTicketStore, useWorkspaceStore } from '../../stores/StoresIndex';
import { canEdit, type WorkspaceOutlet } from '../workspaceContext';
import { Button } from '../../components/buttons/Button';

/** `/tickets` opens the first board; it only renders when there is no board yet. */
export function TicketsPage() {
  const { workspaceId = '' } = useParams();
  const { role } = useOutletContext<WorkspaceOutlet>();
  const navigate = useNavigate();
  const workspace = useWorkspaceStore((state) => state.workspaces.find((item) => item.id === workspaceId));
  const boards = useTicketStore((state) => state.byWorkspace[workspaceId] ?? EMPTY_TICKET_BOARDS);
  const loaded = useTicketStore((state) => state.loadedWorkspaces.has(workspaceId));
  const [creating, setCreating] = useState(false);
  const editable = canEdit(role);

  if (workspace?.encrypted) {
    return <Navigate to={`/w/${workspaceId}/docs`} replace />;
  }
  if (!loaded) {
    return <p className="muted">Loading boards…</p>;
  }
  if (boards.length > 0) {
    return <Navigate to={`/w/${workspaceId}/tickets/${boards[0].id}`} replace />;
  }

  return (
    <div className="home-landing">
      <h1 className="home-landing-title">Tickets</h1>
      <p className="muted home-empty-state">
        No boards yet. A board holds tickets with a status, owner and due date. Try one per team or project.
      </p>
      {editable ? (
        <Button type="button" onClick={() => setCreating(true)}>
          New board
        </Button>
      ) : null}
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
