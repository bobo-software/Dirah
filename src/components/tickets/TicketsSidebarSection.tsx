import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { EMPTY_TICKET_BOARDS, useTicketStore } from '../../stores/StoresIndex';
import { TicketsIcon } from '../layout/SectionIcons';
import { CreateBoardModal } from './BoardModals';
import { Button } from '../buttons/Button';

export function TicketsSidebarSection({ workspaceId, editable }: { workspaceId: string; editable: boolean }) {
  const navigate = useNavigate();
  const boards = useTicketStore((state) => state.byWorkspace[workspaceId] ?? EMPTY_TICKET_BOARDS);
  const loaded = useTicketStore((state) => state.loadedWorkspaces.has(workspaceId));
  const fetchBoards = useTicketStore((state) => state.fetchBoards);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchBoards(workspaceId).then(
      () => setError(null),
      (err: unknown) => setError(err instanceof Error ? err.message : 'Could not load boards')
    );
  }, [workspaceId, fetchBoards]);

  return (
    <>
      <div className="sidebar-pages-header">
        <p className="sidebar-label">Boards</p>
        {editable ? (
          <span className="header-creates">
            <Button variant="link" type="button" onClick={() => setCreating(true)}>
              New
            </Button>
          </span>
        ) : null}
      </div>
      {!loaded ? (
        <p className="muted">Loading boards…</p>
      ) : boards.length === 0 ? (
        <p className="muted">No boards yet.</p>
      ) : (
        <ul className="task-sidebar-list">
          {boards.map((board) => (
            <li key={board.id}>
              <NavLink className="sidebar-home task-sidebar-link" to={`/w/${workspaceId}/tickets/${board.id}`}>
                <TicketsIcon />
                <span className="task-sidebar-title">{board.name}</span>
                <span className="task-sidebar-count" title={`${board.openCount} open`}>
                  {board.openCount}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {creating ? (
        <CreateBoardModal
          workspaceId={workspaceId}
          onClose={() => setCreating(false)}
          onCreated={(view) => {
            setCreating(false);
            navigate(`/w/${workspaceId}/tickets/${view.board.id}`);
          }}
        />
      ) : null}
    </>
  );
}
