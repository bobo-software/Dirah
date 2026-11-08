import { useOutletContext, useParams, useNavigate } from 'react-router-dom';
import type { ChangeEvent } from 'react';
import { EMPTY_PAGES, usePageStore, useMarkdownContentStore } from '../stores/StoresIndex';
import { canEdit, type WorkspaceOutlet } from './workspaceContext';
import { AssetGallery } from '../components/assets/AssetGallery';
import { kindGlyph, pageKind } from '../components/ComponentsIndex';
import { Button } from '../components/buttons/Button';

export function FolderLandingPage({
  onCreate,
}: {
  onCreate: (kind: 'folder' | 'markdown', parentId: string | null) => void;
}) {
  const { workspaceId, pageId } = useParams();
  const navigate = useNavigate();
  const { role, onUploadFiles } = useOutletContext<WorkspaceOutlet>();
  const pages = usePageStore((state) => state.byWorkspace[workspaceId ?? ''] ?? EMPTY_PAGES);
  const createPage = usePageStore((state) => state.createPage);
  const saveContent = useMarkdownContentStore((state) => state.saveContent);
  const editable = canEdit(role);
  const folder = pages.find((page) => page.id === pageId);
  const children = pages.filter((page) => page.parentId === pageId);
  const assetIds = children.filter((page) => pageKind(page) === 'asset').map((page) => page.id);
  const otherChildren = children.filter((page) => pageKind(page) !== 'asset');

  async function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !workspaceId || !pageId) return;
    const title = file.name.replace(/\.md$/i, '') || 'Imported';
    const content = await file.text();
    const page = await createPage(workspaceId, { title, parentId: pageId, kind: 'markdown' });
    await saveContent(page.id, content);
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
          <Button type="button" onClick={() => onCreate('markdown', pageId ?? null)}>
            New markdown
          </Button>
          <Button type="button" onClick={() => onCreate('folder', pageId ?? null)}>
            New folder
          </Button>
          <Button type="button" onClick={() => onUploadFiles(pageId ?? null)}>
            Upload media
          </Button>
          <label className="linkish import-md">
            Import .md
            <input type="file" accept=".md,text/markdown,text/plain" onChange={(e) => void onImport(e)} hidden />
          </label>
        </div>
      ) : null}
      {workspaceId ? (
        <AssetGallery
          workspaceId={workspaceId}
          parentId={pageId ?? null}
          assetIds={assetIds}
          editable={editable}
          onDropFiles={(files) => onUploadFiles(pageId ?? null, files)}
        />
      ) : null}
      {otherChildren.length > 0 ? (
        <ul className="folder-children">
          {otherChildren.map((child) => (
            <li key={child.id}>
              <Button variant="link"
                type="button"
                onClick={() => navigate(`/w/${workspaceId}/p/${child.id}`)}
              >
                {kindGlyph(pageKind(child), child)} {child.title}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
