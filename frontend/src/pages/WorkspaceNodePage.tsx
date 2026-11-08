import { useOutletContext, useParams } from 'react-router-dom';
import { EMPTY_PAGES, usePageStore } from '../stores/StoresIndex';
import { MarkdownEditorPage } from './MarkdownEditorPage';
import { FolderLandingPage } from './FolderLandingPage';
import { AssetPage } from './AssetPage';
import { pageKind } from '../components/ComponentsIndex';
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
  if (kind === 'asset') {
    return <AssetPage key={page.id} />;
  }
  return <MarkdownEditorPage />;
}
