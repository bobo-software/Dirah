import { useOutletContext, useParams } from 'react-router-dom';
import { EMPTY_PAGES, usePageStore, useWorkspaceStore } from '../stores/StoresIndex';
import { canAdmin, canEdit, type WorkspaceOutlet } from './workspaceContext';
import { DocsBrowser, WorkspaceDescriptionEditor } from '../components/ComponentsIndex';

export function WorkspaceHomePage() {
  const { workspaceId } = useParams();
  const { role, onCreateNode } = useOutletContext<WorkspaceOutlet>();
  const workspace = useWorkspaceStore((state) => state.workspaces.find((item) => item.id === workspaceId));
  const pages = usePageStore((state) => state.byWorkspace[workspaceId ?? ''] ?? EMPTY_PAGES);

  if (!workspaceId || !workspace) {
    return <p className="muted">Loading workspace…</p>;
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
      {pages.length === 0 && canEdit(role) ? (
        <div className="folder-actions">
          <button type="button" onClick={() => onCreateNode('markdown')}>
            Create your first document
          </button>
          <button type="button" onClick={() => onCreateNode('folder')}>
            New folder
          </button>
        </div>
      ) : null}
      <DocsBrowser workspaceId={workspaceId} />
    </div>
  );
}
