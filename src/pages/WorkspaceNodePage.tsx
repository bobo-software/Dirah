import { useOutletContext, useParams } from 'react-router-dom';
import { EMPTY_PAGES, usePageStore } from '../stores/StoresIndex';
import { MarkdownEditorPage } from './MarkdownEditorPage';
import { FolderLandingPage } from './FolderLandingPage';
import { pageKind } from './pageKind';
import type { WorkspaceOutlet } from './workspaceContext';

export function WorkspaceNodePage() {
  const { workspaceId, pageId } = useParams();
  const { onCreateNode } = useOutletContext<WorkspaceOutlet>();
  const pages = usePageStore((state) => state.byWorkspace[workspaceId ?? ''] ?? EMPTY_PAGES);
  const page = pages.find((item) => item.id === pageId);
  if (!page) {
    return <p className="muted">Loading…</p>;
  }
  const kind = pageKind(page);
  if (kind === 'folder') {
    return <FolderLandingPage onCreate={onCreateNode} />;
  }
  return <MarkdownEditorPage />;
}
