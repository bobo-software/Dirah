import { NavLink } from 'react-router-dom';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { PublicNote } from '../../api/client';
import type { DropZone, NoteNode } from './noteTreeModel';

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

export function NoteGlyph({ note }: { note: PublicNote }) {
  if (note.icon) {
    return (
      <span className="note-glyph" aria-hidden="true">
        {note.icon}
      </span>
    );
  }
  return (
    <span className="note-glyph" aria-hidden="true">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 2.75h7.4L18.5 7.4v13.85a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V3.75a1 1 0 0 1 1-1Z" />
        <path d="M13.9 2.75V7.4h4.6" />
      </svg>
    </span>
  );
}

const DRAG_TYPE = 'text/note-id';

type NoteTreeProps = {
  nodes: NoteNode[];
  workspaceId: string;
  activeId?: string;
  expandedIds: Set<string>;
  onToggleExpand: (noteId: string) => void;
  onCreateChild: (parent: PublicNote) => void;
  onTrash: (note: PublicNote) => void;
  onMove: (draggedId: string, target: PublicNote, zone: DropZone) => void;
  ancestorIds?: string[];
};

export function NoteTree(props: NoteTreeProps) {
  const ancestorIds = props.ancestorIds ?? [];
  return (
    <ul className="page-tree note-tree">
      {props.nodes.map((node) => (
        <NoteTreeItem key={node.note.id} node={node} {...props} ancestorIds={ancestorIds} />
      ))}
    </ul>
  );
}

function NoteTreeItem({
  node,
  workspaceId,
  activeId,
  expandedIds,
  onToggleExpand,
  onCreateChild,
  onTrash,
  onMove,
  ancestorIds = [],
}: NoteTreeProps & { node: NoteNode }) {
  const note = node.note;
  const hasChildren = node.children.length > 0;
  const expanded = expandedIds.has(note.id);
  const [dragging, setDragging] = useState(false);
  const [zone, setZone] = useState<DropZone | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
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

  function zoneFor(event: DragEvent): DropZone {
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = (event.clientY - rect.top) / rect.height;
    if (offset < 0.28) return 'before';
    if (offset > 0.72) return 'after';
    return 'inside';
  }

  function onDragStart(event: DragEvent) {
    if ((event.target as HTMLElement).closest('button')) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    event.dataTransfer.setData(DRAG_TYPE, note.id);
    event.dataTransfer.effectAllowed = 'move';
    setDragging(true);
  }

  function onDragOver(event: DragEvent) {
    // Only own notes accept drops; dataTransfer contents are hidden until drop.
    if (!note.editable || dragging || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setZone(zoneFor(event));
  }

  function onDragLeave(event: DragEvent) {
    const related = event.relatedTarget as Node | null;
    if (related && event.currentTarget.contains(related)) return;
    setZone(null);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const dropZone = zoneFor(event);
    setZone(null);
    const dragged = event.dataTransfer.getData(DRAG_TYPE);
    if (!dragged || dragged === note.id || ancestorIds.includes(dragged)) return;
    onMove(dragged, note, dropZone);
  }

  const rowClass = [
    'page-row',
    'note-row',
    dragging ? 'dragging' : '',
    zone === 'inside' ? 'drop-target' : '',
    zone === 'before' ? 'drop-before' : '',
    zone === 'after' ? 'drop-after' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={note.id === activeId ? 'active' : undefined}>
      <div
        className={rowClass}
        draggable={note.editable}
        onDragStart={onDragStart}
        onDragEnd={() => {
          setDragging(false);
          setZone(null);
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <span className="row-toggle">
          {hasChildren ? (
            <button
              type="button"
              className={expanded ? 'row-toggle-btn' : 'row-toggle-btn collapsed'}
              aria-label={expanded ? 'Collapse sub-notes' : 'Expand sub-notes'}
              aria-expanded={expanded}
              onClick={() => onToggleExpand(note.id)}
            >
              <ChevronIcon />
            </button>
          ) : null}
        </span>
        <NoteGlyph note={note} />
        <NavLink draggable={false} to={`/w/${workspaceId}/n/${note.id}`}>
          {note.title}
        </NavLink>
        {note.editable ? (
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
                <button
                  type="button"
                  role="menuitem"
                  className="page-row-dropdown-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onCreateChild(note);
                  }}
                >
                  Add sub-note
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="page-row-dropdown-item danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onTrash(note);
                  }}
                >
                  Move to trash
                </button>
              </div>
            ) : null}
          </span>
        ) : null}
      </div>
      {hasChildren && expanded ? (
        <NoteTree
          nodes={node.children}
          workspaceId={workspaceId}
          activeId={activeId}
          expandedIds={expandedIds}
          onToggleExpand={onToggleExpand}
          onCreateChild={onCreateChild}
          onTrash={onTrash}
          onMove={onMove}
          ancestorIds={[...ancestorIds, note.id]}
        />
      ) : null}
    </li>
  );
}
