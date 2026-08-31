import { NavLink } from 'react-router-dom';
import type { DragEvent } from 'react';
import type { PageKind, PublicPage } from '../api/client';
import { ShareDialog } from './ShareDialog';
import { canHaveChildren, kindGlyph, pageKind } from './pageKind';

function RenameIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19 4 20Z" />
      <path d="M13 7l4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 7h15" />
      <path d="M9.5 7V4.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25V7" />
      <path d="M6.5 7.5l.9 12.15a1.5 1.5 0 0 0 1.5 1.35h6.2a1.5 1.5 0 0 0 1.5-1.35l.9-12.15" />
      <path d="M10.2 11v6.2" />
      <path d="M13.8 11v6.2" />
    </svg>
  );
}

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
            {editable && kind === 'markdown' ? (
              <span className="page-row-actions">
                <button type="button" className="linkish icon-btn" aria-label="Rename" title="Rename" onClick={() => onStartRename(page)}>
                  <RenameIcon />
                </button>
                <button type="button" className="linkish icon-btn danger" aria-label="Trash" title="Trash" onClick={() => onTrash(page)}>
                  <TrashIcon />
                </button>
              </span>
            ) : null}
          </div>
          {editable && kind !== 'markdown' ? (
            <span className="page-actions">
              {nestable ? (
                <>
                  <button type="button" className="linkish" onClick={() => onCreateChild(page, 'markdown')}>
                    MD
                  </button>
                  <button type="button" className="linkish" onClick={() => onCreateChild(page, 'folder')}>
                    Folder
                  </button>
                </>
              ) : null}
              <button type="button" className="linkish" onClick={() => onStartRename(page)}>
                Rename
              </button>
              <button type="button" className="linkish danger" onClick={() => onTrash(page)}>
                Trash
              </button>
            </span>
          ) : !editable ? (
            <span className="page-actions" />
          ) : null}
          {admin && active && accessToken && kind === 'markdown' ? (
            <ShareDialog pageId={page.id} accessToken={accessToken} />
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
        />
      ) : null}
    </li>
  );
}
