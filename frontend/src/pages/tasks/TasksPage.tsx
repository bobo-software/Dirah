import { type CSSProperties, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { EMPTY_TASK_LISTS, useTaskStore, useWorkspaceStore } from '../../stores/StoresIndex';
import { TaskProgress } from '../../components/tasks/TaskProgress';
import { taskMode } from '../../components/tasks/runner/modes';
import { categoryHue } from '../../components/docs/categoryColor';
import { Button } from '../../components/buttons/Button';

export function TasksPage() {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();
  const workspace = useWorkspaceStore((state) => state.workspaces.find((item) => item.id === workspaceId));
  const lists = useTaskStore((state) => state.byWorkspace[workspaceId] ?? EMPTY_TASK_LISTS);
  const loaded = useTaskStore((state) => state.loadedWorkspaces.has(workspaceId));
  const createList = useTaskStore((state) => state.createList);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (workspace?.encrypted) {
    return <Navigate to={`/w/${workspaceId}/docs`} replace />;
  }

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const list = await createList(workspaceId);
      navigate(`/w/${workspaceId}/tasks/${list.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a list');
      setBusy(false);
    }
  }

  return (
    <div className="home-landing">
      <h1 className="home-landing-title">Tasks</h1>
      <section className="notes-home" aria-label="Task lists">
        <div className="notes-home-head">
          <p className="muted">Make a list, then run through it one item at a time.</p>
          <Button type="button" onClick={() => void onCreate()} disabled={busy}>
            New list
          </Button>
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {!loaded ? (
          <p className="muted">Loading lists…</p>
        ) : lists.length === 0 ? (
          <p className="muted home-empty-state">No lists yet. Packing lists, shopping runs and pre-flight checks all work well here.</p>
        ) : (
          <div className="docs-grid task-grid">
            {lists.map((list) => {
              const cardStyle = { '--card-hue': categoryHue(list.id) } as CSSProperties;
              const lastRun = list.lastRunAt
                ? new Date(list.lastRunAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                : null;
              return (
                <div key={list.id} className="doc-card task-list-card" style={cardStyle}>
                  <Link to={`/w/${workspaceId}/tasks/${list.id}`} className="doc-card-link">
                    <div className="doc-card-meta">
                      <span>{taskMode(list.mode).name}</span>
                      {lastRun ? <span>Last run {lastRun}</span> : null}
                    </div>
                    <h3 className="doc-card-title">{list.title}</h3>
                    <p className="task-card-count">
                      {list.checkedCount} of {list.itemCount} checked
                    </p>
                    <TaskProgress checked={list.checkedCount} total={list.itemCount} />
                  </Link>
                  <div className="doc-card-foot">
                    <span className="doc-card-status">{list.visibility === 'workspace' ? 'Workspace' : 'Private'}</span>
                    {list.itemCount > 0 ? (
                      <Link className="task-run-link" to={`/w/${workspaceId}/tasks/${list.id}/run`}>
                        Run
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
