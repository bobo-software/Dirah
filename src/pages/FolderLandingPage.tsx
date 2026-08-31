import { useOutletContext, useParams, useNavigate } from 'react-router-dom';
import type { ChangeEvent } from 'react';
import { createPage, putMarkdown } from '../api/pages';
import { canEdit, type WorkspaceOutlet } from './workspaceContext';
import { pageKind } from './pageKind';

export function FolderLandingPage({
  onCreate,
}: {
  onCreate: (kind: 'folder' | 'markdown', parentId: string | null) => void;
}) {
  const { workspaceId, pageId } = useParams();
  const navigate = useNavigate();
  const { role, accessToken, pages, refreshPages } = useOutletContext<WorkspaceOutlet>();
  const editable = canEdit(role);
  const folder = pages.find((page) => page.id === pageId);
  const children = pages.filter((page) => page.parentId === pageId);

  async function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !accessToken || !workspaceId || !pageId) return;
    const title = file.name.replace(/\.md$/i, '') || 'Imported';
    const content = await file.text();
    const page = await createPage(accessToken, workspaceId, {
      title,
      parentId: pageId,
      kind: 'markdown',
    });
    await putMarkdown(accessToken, page.id, content);
    await refreshPages();
    navigate(`/w/${workspaceId}/p/${page.id}`);
  }

  if (folder && pageKind(folder) !== 'folder') {
    return <p className="muted">This is not a folder.</p>;
  }

  return (
    <section className="folder-landing">
      <h1>{folder?.title ?? 'Folder'}</h1>
      <p className="muted">
        {children.length === 0
          ? 'This folder is empty.'
          : `${children.length} item${children.length === 1 ? '' : 's'} in this folder.`}
      </p>
      {editable ? (
        <div className="folder-actions">
          <button type="button" onClick={() => onCreate('markdown', pageId ?? null)}>
            New markdown
          </button>
          <button type="button" onClick={() => onCreate('folder', pageId ?? null)}>
            New folder
          </button>
          <label className="linkish import-md">
            Import .md
            <input type="file" accept=".md,text/markdown,text/plain" onChange={(e) => void onImport(e)} hidden />
          </label>
        </div>
      ) : null}
      {children.length > 0 ? (
        <ul className="folder-children">
          {children.map((child) => (
            <li key={child.id}>
              <button
                type="button"
                className="linkish"
                onClick={() => navigate(`/w/${workspaceId}/p/${child.id}`)}
              >
                {pageKind(child) === 'folder' ? '📁' : 'MD'} {child.title}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
