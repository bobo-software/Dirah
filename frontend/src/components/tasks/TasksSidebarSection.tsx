import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { EMPTY_TASK_LISTS, useTaskStore } from '../../stores/StoresIndex';
import { HomeIcon, TasksIcon } from '../layout/SectionIcons';
import { Button } from '../buttons/Button';

export function TasksSidebarSection({ workspaceId }: { workspaceId: string }) {
  const navigate = useNavigate();
  const lists = useTaskStore((state) => state.byWorkspace[workspaceId] ?? EMPTY_TASK_LISTS);
  const loaded = useTaskStore((state) => state.loadedWorkspaces.has(workspaceId));
  const fetchLists = useTaskStore((state) => state.fetchLists);
  const createList = useTaskStore((state) => state.createList);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchLists(workspaceId).then(
      () => setError(null),
      (err: unknown) => setError(err instanceof Error ? err.message : 'Could not load task lists')
    );
  }, [workspaceId, fetchLists]);

  async function onCreate() {
    setBusy(true);
    try {
      const list = await createList(workspaceId);
      navigate(`/w/${workspaceId}/tasks/${list.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a list');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <NavLink className="sidebar-home" to={`/w/${workspaceId}/tasks`} end>
        <HomeIcon />
        <span>All lists</span>
      </NavLink>
      <div className="sidebar-pages-header">
        <p className="sidebar-label">Lists</p>
        <span className="header-creates">
          <Button variant="link" type="button" onClick={() => void onCreate()} disabled={busy}>
            New
          </Button>
        </span>
      </div>
      {!loaded ? (
        <p className="muted">Loading lists…</p>
      ) : lists.length === 0 ? (
        <p className="muted">No lists yet.</p>
      ) : (
        <ul className="task-sidebar-list">
          {lists.map((list) => (
            <li key={list.id}>
              <NavLink className="sidebar-home task-sidebar-link" to={`/w/${workspaceId}/tasks/${list.id}`}>
                <TasksIcon />
                <span className="task-sidebar-title">{list.title}</span>
                <span className="task-sidebar-count">
                  {list.checkedCount}/{list.itemCount}
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
    </>
  );
}
