import { NavLink } from 'react-router-dom';
import type { DragEvent } from 'react';
import type { PageKind, PublicPage } from '../api/client';
import { ShareDialog } from './ShareDialog';
import { canHaveChildren, kindGlyph, pageKind } from './pageKind';

export type PageNode = {
  page: PublicPage;
  children: PageNode[];
};

export function buildPageTree(pages: PublicPage[]): PageNode[] {
  const ids = new Set(pages.map((page) => page.id));
  const byParent = new Map<string | null, PublicPage[]>();
  for (const page of pages) {
    const parentId = page.parentId && ids.has(page.parentId) ? page.parentId : null;
    const list = byParent.get(parentId) ?? [];
    list.push(page);
    byParent.set(parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  }
  const nest = (parentId: string | null): PageNode[] =>
    (byParent.get(parentId) ?? []).map((page) => ({
      page,
      children: nest(page.id),
    }));
  return nest(null);
}

export function PageTree({
  nodes,
  workspaceId,
  pageId,
  editable,
  admin,
  accessToken,
  renamingId,
  renameValue,
  onRenameValue,
  onStartRename,
  onCommitRename,
  onCreateChild,
  onTrash,
  onFavorite,
  onMove,
  encrypted,
}: {
  nodes: PageNode[];
  workspaceId: string;
  pageId?: string;
  editable: boolean;
  admin: boolean;
  accessToken: string | null;
  renamingId: string | null;
  renameValue: string;
  onRenameValue: (value: string) => void;
  onStartRename: (page: PublicPage) => void;
  onCommitRename: (page: PublicPage) => void;
  onCreateChild: (parent: PublicPage, kind: PageKind) => void;
  onTrash: (page: PublicPage) => void;
  onFavorite: (page: PublicPage) => void;
  onMove: (pageId: string, parentId: string | null) => void;
  encrypted: boolean;
}) {
  return (
    <ul className="page-tree">
      {nodes.map((node) => (
        <PageTreeItem
          key={node.page.id}
          node={node}
          workspaceId={workspaceId}
          pageId={pageId}
          editable={editable}
          admin={admin}
          accessToken={accessToken}
          renamingId={renamingId}
          renameValue={renameValue}
          onRenameValue={onRenameValue}
          onStartRename={onStartRename}
          onCommitRename={onCommitRename}
          onCreateChild={onCreateChild}
          onTrash={onTrash}
          onFavorite={onFavorite}
          onMove={onMove}
          encrypted={encrypted}
        />
      ))}
    </ul>
  );
}

function PageTreeItem({
  node,
  workspaceId,
  pageId,
  editable,
  admin,
  accessToken,
  renamingId,
  renameValue,
  onRenameValue,
  onStartRename,
  onCommitRename,
  onCreateChild,
  onTrash,
  onFavorite,
  onMove,
  encrypted,
}: {
  node: PageNode;
  workspaceId: string;
  pageId?: string;
  editable: boolean;
  admin: boolean;
  accessToken: string | null;
  renamingId: string | null;
  renameValue: string;
  onRenameValue: (value: string) => void;
  onStartRename: (page: PublicPage) => void;
  onCommitRename: (page: PublicPage) => void;
  onCreateChild: (parent: PublicPage, kind: PageKind) => void;
  onTrash: (page: PublicPage) => void;
  onFavorite: (page: PublicPage) => void;
  onMove: (pageId: string, parentId: string | null) => void;
  encrypted: boolean;
}) {
  const page = node.page;
  const kind = pageKind(page);
  const active = page.id === pageId;
  const nestable = canHaveChildren(kind);

  function onDragStart(event: DragEvent) {
    event.dataTransfer.setData('text/page-id', page.id);
    event.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(event: DragEvent) {
    if (!editable || !nestable) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  function onDrop(event: DragEvent) {
    if (!editable || !nestable) return;
    event.preventDefault();
    event.stopPropagation();
    const dragged = event.dataTransfer.getData('text/page-id');
    if (!dragged || dragged === page.id) return;
    onMove(dragged, page.id);
  }

  return (
    <li
      className={active ? 'active' : undefined}
      draggable={editable && renamingId !== page.id}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {renamingId === page.id ? (
        <form
          className="rename-form"
          onSubmit={(event) => {
            event.preventDefault();
            onCommitRename(page);
          }}
        >
          <input
            aria-label="Page title"
            value={renameValue}
            onChange={(event) => onRenameValue(event.target.value)}
            onBlur={() => onCommitRename(page)}
            autoFocus
          />
        </form>
      ) : (
        <>
          <div className="page-row">
            <span className="kind-glyph" title={kind}>
              {kindGlyph(kind)}
            </span>
            <NavLink to={`/w/${workspaceId}/p/${page.id}`}>{page.title}</NavLink>
            <button
              type="button"
              className={page.favorited ? 'linkish star on' : 'linkish star'}
              aria-label={page.favorited ? 'Remove favorite' : 'Favorite'}
              onClick={() => onFavorite(page)}
            >
              {page.favorited ? '★' : '☆'}
            </button>
          </div>
          {editable ? (
            <span className="page-actions">
              {nestable ? (
                <>
                  <button type="button" className="linkish" onClick={() => onCreateChild(page, 'page')}>
                    Page
                  </button>
                  {!encrypted ? (
                    <>
                      <button type="button" className="linkish" onClick={() => onCreateChild(page, 'folder')}>
                        Folder
                      </button>
                      <button type="button" className="linkish" onClick={() => onCreateChild(page, 'markdown')}>
                        MD
                      </button>
                    </>
                  ) : null}
                </>
              ) : null}
              <button type="button" className="linkish" onClick={() => onStartRename(page)}>
                Rename
              </button>
              <button type="button" className="linkish danger" onClick={() => onTrash(page)}>
                Trash
              </button>
            </span>
          ) : (
            <span className="page-actions" />
          )}
          {admin && active && accessToken && kind === 'page' ? (
            <ShareDialog pageId={page.id} accessToken={accessToken} encrypted={encrypted} />
          ) : null}
        </>
      )}
      {node.children.length > 0 ? (
        <PageTree
          nodes={node.children}
          workspaceId={workspaceId}
          pageId={pageId}
          editable={editable}
          admin={admin}
          accessToken={accessToken}
          renamingId={renamingId}
          renameValue={renameValue}
          onRenameValue={onRenameValue}
          onStartRename={onStartRename}
          onCommitRename={onCommitRename}
          onCreateChild={onCreateChild}
          onTrash={onTrash}
          onFavorite={onFavorite}
          onMove={onMove}
          encrypted={encrypted}
        />
      ) : null}
    </li>
  );
}
