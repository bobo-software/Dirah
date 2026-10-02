import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTaskStore } from '../../stores/StoresIndex';
import { TaskRunner } from '../../components/tasks/runner/TaskRunner';

export function ChecklistRunPage() {
  const { workspaceId = '', listId = '' } = useParams();
  const navigate = useNavigate();
  const fetchList = useTaskStore((state) => state.fetchList);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Always start from the server's copy, so a run never acts on stale checks.
  useEffect(() => {
    void fetchList(listId).then(
      () => setReady(true),
      (err: unknown) => setError(err instanceof Error ? err.message : 'Could not load this list')
    );
  }, [listId, fetchList]);

  if (error) return <p className="error note-page-empty">{error}</p>;
  if (!ready) return <p className="muted note-page-empty">Loading list…</p>;
  return <TaskRunner listId={listId} onExit={() => navigate(`/w/${workspaceId}/tasks/${listId}`, { replace: true })} />;
}
