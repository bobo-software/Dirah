import { useOutletContext, useParams } from 'react-router-dom';
import { MarkdownEditorPage } from './MarkdownEditorPage';
import { FolderLandingPage } from './FolderLandingPage';
import { pageKind } from './pageKind';
import type { WorkspaceOutlet } from './workspaceContext';

export function WorkspaceNodePage() {
  const { pageId } = useParams();
  const { pages, onCreateNode } = useOutletContext<WorkspaceOutlet>();
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
