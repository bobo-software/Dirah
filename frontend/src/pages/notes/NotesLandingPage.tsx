import { Navigate, useOutletContext, useParams } from 'react-router-dom';
import { useWorkspaceStore } from '../../stores/StoresIndex';
import { canAdmin, type WorkspaceOutlet } from '../workspaceContext';
import { NotesBrowser, WorkspaceDescriptionEditor } from '../../components/ComponentsIndex';

export function NotesLandingPage() {
  const { workspaceId } = useParams();
  const { role } = useOutletContext<WorkspaceOutlet>();
  const workspace = useWorkspaceStore((state) => state.workspaces.find((item) => item.id === workspaceId));

  if (!workspaceId || !workspace) {
    return <p className="muted">Loading workspace…</p>;
  }

  // Notes aren't available in encrypted workspaces yet; Docs is their home.
  if (workspace.encrypted) {
    return <Navigate to={`/w/${workspaceId}/docs`} replace />;
  }

  return (
    <div className="home-landing">
      <h1 className="home-landing-title">{workspace.name}</h1>
      <WorkspaceDescriptionEditor
        key={workspaceId}
        workspaceId={workspaceId}
        description={workspace.description ?? null}
        editable={canAdmin(role)}
      />
      <NotesBrowser workspaceId={workspaceId} />
    </div>
  );
}
