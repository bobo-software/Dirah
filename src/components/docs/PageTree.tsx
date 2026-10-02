import { NavLink } from 'react-router-dom';
import { useEffect, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import type { PageKind, PublicPage } from '../../api/client';
import { canHaveChildren, kindGlyph, pageKind } from './pageKind';
import { categoryHue } from './categoryColor';

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function KebabIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

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
  expandedIds: Set<string>;
  onToggleExpand: (pageId: string) => void;
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
  expandedIds,
  onToggleExpand,
  ancestorIds = [],
}: PageTreeProps & { node: PageNode }) {
  const page = node.page;
  const kind = pageKind(page);
  const active = page.id === pageId;
  const nestable = canHaveChildren(kind);
  const hasChildren = node.children.length > 0;
  const expanded = expandedIds.has(page.id);
  const collapsed = !expanded;
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuTriggerRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

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

  function onRowClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!nestable) return;
    if ((event.target as HTMLElement).closest('button, input, a')) return;
    onToggleExpand(page.id);
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
        <div
          className={rowClass}
          draggable={editable && renamingId !== page.id}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={onRowClick}
          title={nestable && editable ? 'Drop a file here to move it into this folder' : undefined}
        >
          <span className="row-toggle">
            {nestable && hasChildren ? (
              <button
                type="button"
                className={collapsed ? 'row-toggle-btn collapsed' : 'row-toggle-btn'}
                aria-label={collapsed ? 'Expand folder' : 'Collapse folder'}
                aria-expanded={!collapsed}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleExpand(page.id);
                }}
              >
                <ChevronIcon />
              </button>
            ) : null}
          </span>
          {nestable ? (
            <span
              className="category-dot"
              aria-hidden="true"
              style={{ background: `hsl(${categoryHue(page.id)} 55% 50%)` }}
            />
          ) : (
            <span className="kind-glyph" title={kind}>
              {kindGlyph(kind)}
            </span>
          )}
          {nestable ? (
            <span className="page-row-title">{page.title}</span>
          ) : (
            <NavLink draggable={false} to={`/w/${workspaceId}/p/${page.id}`}>
              {page.title}
            </NavLink>
          )}
          {nestable ? <span className="page-row-count">{node.children.length}</span> : null}
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
          {editable && kind !== 'markdown' ? (
            <span className={menuOpen ? 'page-row-menu open' : 'page-row-menu'} ref={menuRef}>
              <button
                type="button"
                ref={menuTriggerRef}
                className="linkish icon-btn"
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((value) => !value)}
              >
                <KebabIcon />
              </button>
              {menuOpen ? (
                <div className="page-row-dropdown" role="menu">
                  {nestable ? (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        className="page-row-dropdown-item"
                        onClick={() => {
                          setMenuOpen(false);
                          onCreateChild(page, 'markdown');
                        }}
                      >
                        New file
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="page-row-dropdown-item"
                        onClick={() => {
                          setMenuOpen(false);
                          onCreateChild(page, 'folder');
                        }}
                      >
                        New subfolder
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className="page-row-dropdown-item"
                    onClick={() => {
                      setMenuOpen(false);
                      onStartRename(page);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="page-row-dropdown-item danger"
                    onClick={() => {
                      setMenuOpen(false);
                      onTrash(page);
                    }}
                  >
                    Trash
                  </button>
                </div>
              ) : null}
            </span>
          ) : null}
        </div>
      )}
      {hasChildren && expanded ? (
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
          expandedIds={expandedIds}
          onToggleExpand={onToggleExpand}
          ancestorIds={[...ancestorIds, page.id]}
        />
      ) : null}
    </li>
  );
}
