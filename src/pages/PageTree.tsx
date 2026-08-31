import { NavLink } from 'react-router-dom';
import { useState, type DragEvent } from 'react';
import type { PageKind, PublicPage } from '../api/client';
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

export function draggedPageId(data: DataTransfer): string {
  return data.getData('text/page-id') || data.getData('text/plain');
}

type PageTreeProps = {
  nodes: PageNode[];
  workspaceId: string;
  pageId?: string;
  editable: boolean;
  renamingId: string | null;
  renameValue: string;
  onRenameValue: (value: string) => void;
  onStartRename: (page: PublicPage) => void;
  onCommitRename: (page: PublicPage) => void;
  onCreateChild: (parent: PublicPage, kind: PageKind) => void;
  onTrash: (page: PublicPage) => void;
  onFavorite: (page: PublicPage) => void;
  onMove: (pageId: string, parentId: string | null) => void;
  ancestorIds?: string[];
};

export function PageTree(props: PageTreeProps) {
  const ancestorIds = props.ancestorIds ?? [];
  return (
    <ul className="page-tree">
      {props.nodes.map((node) => (
        <PageTreeItem key={node.page.id} node={node} {...props} ancestorIds={ancestorIds} />
      ))}
    </ul>
  );
}

function PageTreeItem({
  node,
  workspaceId,
  pageId,
  editable,
  renamingId,
  renameValue,
  onRenameValue,
  onStartRename,
  onCommitRename,
  onCreateChild,
  onTrash,
  onFavorite,
  onMove,
  ancestorIds = [],
}: PageTreeProps & { node: PageNode }) {
  const page = node.page;
  const kind = pageKind(page);
  const active = page.id === pageId;
  const nestable = canHaveChildren(kind);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState(false);

  function canAccept(dragged: string): boolean {
    if (!editable || !nestable || !dragged) return false;
    if (dragged === page.id) return false;
    if (ancestorIds.includes(dragged)) return false;
    if (node.children.some((child) => child.page.id === dragged)) return false;
    return true;
  }

  function onDragStart(event: DragEvent) {
    if ((event.target as HTMLElement).closest('button, input')) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    event.dataTransfer.setData('text/page-id', page.id);
    event.dataTransfer.setData('text/plain', page.id);
    event.dataTransfer.effectAllowed = 'move';
    setDragging(true);
  }

  function onDragEnd() {
    setDragging(false);
    setOver(false);
  }

  function onDragOver(event: DragEvent) {
    if (!editable || !nestable || dragging) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setOver(true);
  }

  function onDragLeave(event: DragEvent) {
    const related = event.relatedTarget as Node | null;
    if (related && event.currentTarget.contains(related)) return;
    setOver(false);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setOver(false);
    const dragged = draggedPageId(event.dataTransfer);
    if (!canAccept(dragged)) return;
    onMove(dragged, page.id);
  }

  const rowClass = [
    'page-row',
    dragging ? 'dragging' : '',
    over && nestable ? 'drop-target' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={active ? 'active' : undefined}>
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
          <div
            className={rowClass}
            draggable={editable && renamingId !== page.id}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            title={nestable && editable ? 'Drop a file here to move it into this folder' : undefined}
          >
            <span className="kind-glyph" title={kind}>
              {kindGlyph(kind)}
            </span>
            <NavLink draggable={false} to={`/w/${workspaceId}/p/${page.id}`}>
              {page.title}
            </NavLink>
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
        </>
      )}
      {node.children.length > 0 ? (
        <PageTree
          nodes={node.children}
          workspaceId={workspaceId}
          pageId={pageId}
          editable={editable}
          renamingId={renamingId}
          renameValue={renameValue}
          onRenameValue={onRenameValue}
          onStartRename={onStartRename}
          onCommitRename={onCommitRename}
          onCreateChild={onCreateChild}
          onTrash={onTrash}
          onFavorite={onFavorite}
          onMove={onMove}
          ancestorIds={[...ancestorIds, page.id]}
        />
      ) : null}
    </li>
  );
}
