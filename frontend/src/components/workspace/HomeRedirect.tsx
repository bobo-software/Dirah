import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useWorkspaceStore } from '../../stores/StoresIndex';
import CreateWorkspaceModal from './CreateWorkspaceModal';
import { pickDefaultWorkspaceId, setLastWorkspaceId } from './lastWorkspace';
import { Button } from '../buttons/Button';

export default function HomeRedirect() {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const fetchWorkspaces = useWorkspaceStore((state) => state.fetchWorkspaces);
  const [settled, setSettled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    void fetchWorkspaces()
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : 'Could not load workspaces');
      })
      .finally(() => setSettled(true));
  }, [fetchWorkspaces]);

  if (createdId) {
    return <Navigate to={`/w/${createdId}`} replace />;
  }

  if (!settled) {
    return <p className="muted">Loading workspace…</p>;
  }

  const defaultId = pickDefaultWorkspaceId(workspaces.map((item) => item.id));
  if (defaultId) {
    return <Navigate to={`/w/${defaultId}`} replace />;
  }

  return (
    <section className="panel">
      <h1>Create a workspace</h1>
      <p className="muted">There is no workspace yet. Create one to get started.</p>
      {message ? (
        <p className="error" role="alert">
          {message}
        </p>
      ) : null}
      <Button type="button" onClick={() => setModalOpen(true)}>
        New workspace
      </Button>
      <CreateWorkspaceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(workspace) => {
          setLastWorkspaceId(workspace.id);
          setCreatedId(workspace.id);
        }}
      />
    </section>
  );
}
