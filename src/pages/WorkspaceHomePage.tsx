import { useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { EMPTY_PAGES, usePageStore, useWorkspaceStore } from '../stores/StoresIndex';
import { canAdmin, canEdit, type WorkspaceOutlet } from './workspaceContext';
import { WorkspaceDescriptionEditor } from './WorkspaceDescriptionEditor';
import { DocsBrowser } from './DocsBrowser';
import { NotesHome } from './notes/NotesHome';

type HomeTab = 'docs' | 'tasks' | 'notes';

function parseTab(value: string | null): HomeTab {
  return value === 'tasks' || value === 'notes' ? value : 'docs';
}

function DocsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 2.75h7.4L18.5 7.4v13.85a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V3.75a1 1 0 0 1 1-1Z" />
      <path d="M13.9 2.75V7.4h4.6" />
      <path d="M9 12.6h6.5M9 16.1h6.5" />
    </svg>
  );
}

function TasksIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.25" y="4.25" width="15.5" height="15.5" rx="3" />
      <path d="M8.3 12.1l2.3 2.3 5.1-5.3" />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5.5 3.75h9.25l3.75 3.75v12.75a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1V4.75a1 1 0 0 1 1-1Z" />
      <path d="M8.5 9.5h7M8.5 13h7M8.5 16.5h4" />
    </svg>
  );
}

export function WorkspaceHomePage() {
  const { workspaceId } = useParams();
  const { role, onCreateNode } = useOutletContext<WorkspaceOutlet>();
  const workspace = useWorkspaceStore((state) => state.workspaces.find((item) => item.id === workspaceId));
  const pages = usePageStore((state) => state.byWorkspace[workspaceId ?? ''] ?? EMPTY_PAGES);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));

  if (!workspaceId || !workspace) {
    return <p className="muted">Loading workspace…</p>;
  }

  const canEditDescription = canAdmin(role);
  const canEditDocs = canEdit(role);

  function onTab(next: HomeTab) {
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'docs') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', next);
    }
    setSearchParams(nextParams, { replace: true });
  }

  return (
    <div className="home-landing">
      <h1 className="home-landing-title">{workspace.name}</h1>
      <WorkspaceDescriptionEditor
        key={workspaceId}
        workspaceId={workspaceId}
        description={workspace.description ?? null}
        editable={canEditDescription}
      />
      {pages.length === 0 && canEditDocs ? (
        <div className="folder-actions">
          <button type="button" onClick={() => onCreateNode('markdown')}>
            Create your first document
          </button>
          <button type="button" onClick={() => onCreateNode('folder')}>
            New folder
          </button>
        </div>
      ) : null}
      <div className="home-tabs" role="group" aria-label="Workspace sections">
        <button
          type="button"
          className={tab === 'docs' ? 'home-tab on' : 'home-tab'}
          aria-pressed={tab === 'docs'}
          onClick={() => onTab('docs')}
        >
          <DocsIcon />
          Docs
        </button>
        <button
          type="button"
          className={tab === 'tasks' ? 'home-tab on' : 'home-tab'}
          aria-pressed={tab === 'tasks'}
          onClick={() => onTab('tasks')}
        >
          <TasksIcon />
          Tasks
        </button>
        <button
          type="button"
          className={tab === 'notes' ? 'home-tab on' : 'home-tab'}
          aria-pressed={tab === 'notes'}
          onClick={() => onTab('notes')}
        >
          <NotesIcon />
          Notes
        </button>
      </div>
      {tab === 'docs' ? (
        <DocsBrowser workspaceId={workspaceId} />
      ) : tab === 'notes' ? (
        <NotesHome workspaceId={workspaceId} />
      ) : (
        <p className="muted home-empty-state">Tasks are coming soon.</p>
      )}
    </div>
  );
}
