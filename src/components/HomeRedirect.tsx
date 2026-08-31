import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { PublicWorkspace } from '../api/client';
import CreateWorkspaceModal from './CreateWorkspaceModal';
import { pickDefaultWorkspaceId, setLastWorkspaceId } from './lastWorkspace';

export default function HomeRedirect() {
  const { listWorkspaces } = useAuth();
  const [workspaces, setWorkspaces] = useState<PublicWorkspace[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    void listWorkspaces()
      .then(setWorkspaces)
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : 'Could not load workspaces');
        setWorkspaces([]);
      });
  }, [listWorkspaces]);

  if (createdId) {
    return <Navigate to={`/w/${createdId}`} replace />;
  }

  if (workspaces === null) {
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
      <button type="button" onClick={() => setModalOpen(true)}>
        New workspace
      </button>
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
