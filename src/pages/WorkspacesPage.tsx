import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { PublicWorkspace } from '../api/client';

export function WorkspacesPage() {
  const { listWorkspaces, createWorkspace } = useAuth();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<PublicWorkspace[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listWorkspaces()
      .then(setWorkspaces)
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : 'Could not load workspaces');
      });
  }, [listWorkspaces]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const workspace = await createWorkspace(name);
      navigate(`/w/${workspace.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create workspace');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h1>Workspaces</h1>
      {workspaces.length === 0 ? (
        <p className="muted">No workspaces yet. Create one to continue.</p>
      ) : (
        <ul className="workspace-list">
          {workspaces.map((workspace) => (
            <li key={workspace.id}>
              <Link to={`/w/${workspace.id}`}>{workspace.name}</Link>
              <span className="muted">{workspace.role}</span>
            </li>
          ))}
        </ul>
      )}
      <form className="inline-form" onSubmit={onCreate}>
        <label>
          New workspace name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={busy}>
          New workspace
        </button>
      </form>
      {message ? <p className="error">{message}</p> : null}
    </section>
  );
}
