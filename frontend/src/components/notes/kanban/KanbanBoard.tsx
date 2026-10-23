import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PublicNote } from '../../../api/client';
import {
  createKanbanCard,
  createKanbanColumn,
  deleteKanbanColumn,
  getKanbanBoard,
  moveKanbanCard,
  orderKanbanColumns,
  patchKanbanColumn,
  patchNote,
  removeKanbanCard,
  type KanbanBoardData,
  type KanbanCard,
  type KanbanColumn,
} from '../../../api/notes';
import { confirmDelete } from '../../layout/deleteDialogue';
import { EMPTY_NOTES, useAuthStore, useNoteStore } from '../../../stores/StoresIndex';
import { NoteEditor } from '../NoteEditor';
import { NoteGlyph } from '../NoteTree';
import { Button } from '../../buttons/Button';

const CARD_DRAG = 'text/kanban-card';
const COLUMN_DRAG = 'text/kanban-column';

function token(): string {
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) throw new Error('Not signed in');
  return accessToken;
}

function breadcrumbs(notes: PublicNote[], note: PublicNote | undefined): PublicNote[] {
  const byId = new Map(notes.map((item) => [item.id, item]));
  const trail: PublicNote[] = [];
  const seen = new Set<string>();
  let cursor = note;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    trail.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return trail;
}

function noteTrail(notes: PublicNote[], note: PublicNote): string {
  const byId = new Map(notes.map((item) => [item.id, item]));
  const titles: string[] = [];
  const seen = new Set<string>();
  let cursor = note.parentId ? byId.get(note.parentId) : undefined;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    titles.unshift(cursor.title);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return titles.join(' / ');
}

function remember(data: KanbanBoardData) {
  const { mergeNote } = useNoteStore.getState();
  mergeNote(data.board);
  for (const column of data.columns) {
    for (const card of column.cards) mergeNote(card.note);
  }
}

function insertionIndex(cards: KanbanCard[], draggedId: string, targetId: string | null, after: boolean): number {
  const without = cards.filter((card) => card.noteId !== draggedId);
  if (!targetId) return without.length;
  const target = without.findIndex((card) => card.noteId === targetId);
  if (target < 0) return without.length;
  return target + (after ? 1 : 0);
}

function applyCardMove(data: KanbanBoardData, draggedId: string, columnId: string, index: number): KanbanBoardData {
  const columns = data.columns.map((column) => ({ ...column, cards: column.cards.map((card) => ({ ...card })) }));
  let moved: KanbanCard | undefined;
  for (const column of columns) {
    const at = column.cards.findIndex((card) => card.noteId === draggedId);
    if (at >= 0) moved = column.cards.splice(at, 1)[0];
  }
  const destination = columns.find((column) => column.id === columnId);
  if (!moved || !destination) return data;
  destination.cards.splice(Math.max(0, Math.min(index, destination.cards.length)), 0, moved);
  return { ...data, columns };
}

function applyColumnOrder(data: KanbanBoardData, columnIds: string[]): KanbanBoardData {
  const byId = new Map(data.columns.map((column) => [column.id, column]));
  return { ...data, columns: columnIds.flatMap((id) => byId.get(id) ?? []) };
}

export function KanbanBoard({ workspaceId, noteId }: { workspaceId: string; noteId: string }) {
  const notes = useNoteStore((state) => state.byWorkspace[workspaceId] ?? EMPTY_NOTES);
  const fetchNotes = useNoteStore((state) => state.fetchNotes);
  const [data, setData] = useState<KanbanBoardData | null>(null);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [cardDrop, setCardDrop] = useState<{ columnId: string; cardId: string | null; after: boolean } | null>(null);
  const [columnDrop, setColumnDrop] = useState<{ columnId: string; after: boolean } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [peekId, setPeekId] = useState<string | null>(null);
  // Stable so the peek modal's focus effect doesn't re-run on every board render.
  const closePeek = useCallback(() => setPeekId(null), []);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setMessage(null);
    void (async () => {
      try {
        const [board] = await Promise.all([getKanbanBoard(token(), noteId), fetchNotes(workspaceId)]);
        if (cancelled) return;
        remember(board);
        setData(board);
        setTitle(board.board.title);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Could not load board');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noteId, workspaceId, fetchNotes]);

  function accept(next: KanbanBoardData) {
    remember(next);
    setData(next);
  }

  async function run(action: () => Promise<KanbanBoardData>) {
    setMessage(null);
    try {
      accept(await action());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update board');
      try {
        accept(await getKanbanBoard(token(), noteId));
      } catch {
        // The message above is the one to show.
      }
    }
  }

  async function commitTitle(event?: FormEvent) {
    event?.preventDefault();
    if (!data?.board.editable) return;
    const next = title.trim() || 'Untitled';
    setTitle(next);
    if (next === data.board.title) return;
    try {
      const note = await patchNote(token(), data.board.id, { title: next });
      useNoteStore.getState().mergeNote(note);
      setData((current) => (current ? { ...current, board: note } : current));
    } catch (error) {
      setTitle(data.board.title);
      setMessage(error instanceof Error ? error.message : 'Could not rename board');
    }
  }

  async function commitCardTitle(note: PublicNote, nextTitle: string) {
    const next = nextTitle.trim() || 'Untitled';
    if (next === note.title) return;
    try {
      const updated = await patchNote(token(), note.id, { title: next });
      useNoteStore.getState().mergeNote(updated);
      setData((current) =>
        current
          ? {
              ...current,
              columns: current.columns.map((column) => ({
                ...column,
                cards: column.cards.map((card) => (card.noteId === note.id ? { ...card, note: updated } : card)),
              })),
            }
          : current
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not rename card');
    }
  }

  function onCardDrop(event: DragEvent, columnId: string, targetCardId: string | null, after: boolean) {
    event.preventDefault();
    event.stopPropagation();
    setCardDrop(null);
    setDragging(null);
    const draggedId = event.dataTransfer.getData(CARD_DRAG);
    if (!draggedId || !data?.board.editable) return;
    const column = data.columns.find((item) => item.id === columnId);
    if (!column) return;
    const index = insertionIndex(column.cards, draggedId, targetCardId, after);
    const currentIndex = column.cards.findIndex((card) => card.noteId === draggedId);
    if (currentIndex === index) return;
    const previous = data;
    setData(applyCardMove(data, draggedId, columnId, index));
    void moveKanbanCard(token(), { boardId: noteId, noteId: draggedId, columnId, position: index })
      .then(accept)
      .catch((error: unknown) => {
        setData(previous);
        setMessage(error instanceof Error ? error.message : 'Could not move card');
      });
  }

  function onColumnDrop(event: DragEvent, targetId: string) {
    const draggedId = event.dataTransfer.getData(COLUMN_DRAG);
    if (!draggedId || !data?.board.editable) return;
    event.preventDefault();
    event.stopPropagation();
    setColumnDrop(null);
    setDragging(null);
    if (draggedId === targetId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientX > rect.left + rect.width / 2;
    const ids = data.columns.map((column) => column.id);
    const from = ids.indexOf(draggedId);
    let to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    if (after) to += 1;
    if (from < to) to -= 1;
    if (from === to) return;
    const next = ids.slice();
    next.splice(from, 1);
    next.splice(to, 0, draggedId);
    const previous = data;
    setData(applyColumnOrder(data, next));
    void orderKanbanColumns(token(), noteId, next)
      .then(accept)
      .catch((error: unknown) => {
        setData(previous);
        setMessage(error instanceof Error ? error.message : 'Could not reorder columns');
      });
  }

  const trail = breadcrumbs(notes, data?.board);
  const editable = data?.board.editable ?? false;
  const takenIds = useMemo(() => {
    const ids = new Set<string>([noteId]);
    for (const column of data?.columns ?? []) {
      for (const card of column.cards) ids.add(card.noteId);
    }
    return ids;
  }, [data, noteId]);
  const cardCount = takenIds.size - 1;
  // Cards read their note from the store so edits made in the peek modal show up immediately.
  const columns = useMemo(() => {
    const byId = new Map(notes.map((note) => [note.id, note]));
    return (data?.columns ?? []).map((column) => ({
      ...column,
      cards: column.cards.map((card) => ({ ...card, note: byId.get(card.noteId) ?? card.note })),
    }));
  }, [data, notes]);

  function endDrag() {
    setDragging(null);
    setCardDrop(null);
    setColumnDrop(null);
  }

  return (
    <article className="note-page kanban-page">
      <nav className="note-crumbs" aria-label="Breadcrumbs">
        <Link to={`/w/${workspaceId}`}>Notes</Link>
        {trail.map((item, index) => {
          const current = item.id === data?.board.id && index === trail.length - 1;
          return (
            <span key={item.id}>
              <span aria-hidden="true">/</span>
              {current ? (
                <span aria-current="page">{item.title}</span>
              ) : (
                <Link to={`/w/${workspaceId}/n/${item.id}`}>{item.title}</Link>
              )}
            </span>
          );
        })}
      </nav>
      {data && !editable ? <p className="note-banner">Shared by another member. View only.</p> : null}
      {message ? (
        <p className="error" role="alert">
          {message}
        </p>
      ) : null}
      <header className="note-header">
        {data ? <NoteGlyph note={data.board} /> : null}
        <form onSubmit={(event) => void commitTitle(event)}>
          <input
            className="note-title-input"
            aria-label="Board title"
            value={title}
            placeholder="Untitled"
            readOnly={!editable}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void commitTitle()}
          />
        </form>
      </header>
      {data ? (
        <p className="kanban-summary">
          {data.columns.length} {data.columns.length === 1 ? 'column' : 'columns'} · {cardCount}{' '}
          {cardCount === 1 ? 'card' : 'cards'}
        </p>
      ) : null}
      {!data && !message ? (
        <div className="kanban-board kanban-loading" aria-busy="true" aria-label="Loading board">
          {[0, 1, 2].map((index) => (
            <div key={index} className="kanban-column kanban-skeleton" />
          ))}
        </div>
      ) : null}
      {data ? (
        <div className={`kanban-board${dragging ? ' is-dragging' : ''}`}>
          {columns.map((column) => (
            <KanbanColumnView
              key={column.id}
              column={column}
              workspaceId={workspaceId}
              notes={notes}
              editable={editable}
              dragging={dragging}
              onDragStart={setDragging}
              onDragEnd={endDrag}
              cardDrop={cardDrop?.columnId === column.id ? cardDrop : null}
              columnDrop={columnDrop?.columnId === column.id ? columnDrop.after : null}
              onCardDragOver={(cardId, after) => setCardDrop({ columnId: column.id, cardId, after })}
              onCardDragLeave={() => setCardDrop((current) => (current?.columnId === column.id ? null : current))}
              onCardDrop={(event, targetCardId, after) => onCardDrop(event, column.id, targetCardId, after)}
              onColumnDragOver={(after) => setColumnDrop({ columnId: column.id, after })}
              onColumnDragLeave={() => setColumnDrop((current) => (current?.columnId === column.id ? null : current))}
              onColumnDrop={(event) => onColumnDrop(event, column.id)}
              onRenameColumn={(next) => void run(() => patchKanbanColumn(token(), column.id, { title: next }))}
              onDeleteColumn={() => {
                void confirmDelete({
                  title: 'Delete column?',
                  message: `Delete “${column.title}”? Cards leave the board. The notes stay.`,
                }).then((confirmed) => {
                  if (!confirmed) return;
                  void run(() => deleteKanbanColumn(token(), column.id));
                });
              }}
              takenIds={takenIds}
              onAddCard={(cardTitle) =>
                void run(() => createKanbanCard(token(), noteId, { columnId: column.id, title: cardTitle }))
              }
              onPlaceNote={(placedId) =>
                void run(() => createKanbanCard(token(), noteId, { columnId: column.id, noteId: placedId }))
              }
              onRenameCard={(note, next) => void commitCardTitle(note, next)}
              onOpenCard={(card) => setPeekId(card.noteId)}
              onRemoveCard={(card) => {
                void confirmDelete({
                  title: 'Remove card?',
                  message: `Remove “${card.note.title}” from this board? The note stays in your notes.`,
                  confirmLabel: 'Remove',
                }).then((confirmed) => {
                  if (!confirmed) return;
                  void run(() => removeKanbanCard(token(), noteId, card.noteId));
                });
              }}
            />
          ))}
          {editable ? (
            <AddColumn
              onAdd={(columnTitle) => void run(() => createKanbanColumn(token(), noteId, columnTitle))}
            />
          ) : null}
        </div>
      ) : null}
      {peekId ? <CardPeek workspaceId={workspaceId} noteId={peekId} onClose={closePeek} /> : null}
    </article>
  );
}

function CardPeek({ workspaceId, noteId, onClose }: { workspaceId: string; noteId: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const href = `/w/${workspaceId}/n/${noteId}`;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop kanban-peek-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="kanban-peek" role="dialog" aria-modal="true" aria-label="Card" tabIndex={-1} ref={dialogRef}>
        <NoteEditor
          key={noteId}
          workspaceId={workspaceId}
          noteId={noteId}
          variant="peek"
          actions={
            <span className="kanban-peek-actions">
              <Link to={href} className="kanban-icon-btn" aria-label="Open as full page" title="Open as full page">
                <ExpandIcon />
              </Link>
              <Button variant="plain" type="button" className="kanban-icon-btn" aria-label="Close" title="Close (Esc)" onClick={onClose}>
                <CloseIcon />
              </Button>
            </span>
          }
        />
      </div>
    </div>
  );
}


function AddColumn({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');

  function close() {
    setTitle('');
    setOpen(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onAdd(title.trim() || 'Untitled');
    close();
  }

  if (!open) {
    return (
      <Button variant="plain" type="button" className="kanban-add-column" onClick={() => setOpen(true)}>
        <PlusIcon />
        Add column
      </Button>
    );
  }

  return (
    <form className="kanban-add-column open" onSubmit={submit}>
      <input
        aria-label="Column title"
        value={title}
        placeholder="Column title"
        autoFocus
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close();
        }}
      />
      <span className="kanban-form-actions">
        <Button type="submit">Add column</Button>
        <Button variant="plain" type="button" className="kanban-ghost" onClick={close}>
          Cancel
        </Button>
      </span>
    </form>
  );
}

function KanbanColumnView({
  column,
  workspaceId,
  notes,
  takenIds,
  editable,
  dragging,
  onDragStart,
  onDragEnd,
  cardDrop,
  columnDrop,
  onCardDragOver,
  onCardDragLeave,
  onCardDrop,
  onColumnDragOver,
  onColumnDragLeave,
  onColumnDrop,
  onRenameColumn,
  onDeleteColumn,
  onAddCard,
  onPlaceNote,
  onRenameCard,
  onOpenCard,
  onRemoveCard,
}: {
  column: KanbanColumn;
  workspaceId: string;
  notes: PublicNote[];
  takenIds: Set<string>;
  editable: boolean;
  dragging: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  cardDrop: { cardId: string | null; after: boolean } | null;
  columnDrop: boolean | null;
  onCardDragOver: (cardId: string | null, after: boolean) => void;
  onCardDragLeave: () => void;
  onCardDrop: (event: DragEvent, targetCardId: string | null, after: boolean) => void;
  onColumnDragOver: (after: boolean) => void;
  onColumnDragLeave: () => void;
  onColumnDrop: (event: DragEvent) => void;
  onRenameColumn: (title: string) => void;
  onDeleteColumn: () => void;
  onAddCard: (title: string) => void;
  onPlaceNote: (noteId: string) => void;
  onRenameCard: (note: PublicNote, title: string) => void;
  onOpenCard: (card: KanbanCard) => void;
  onRemoveCard: (card: KanbanCard) => void;
}) {
  const [title, setTitle] = useState(column.title);
  const [adding, setAdding] = useState(false);
  const [cardTitle, setCardTitle] = useState('');
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    setTitle(column.title);
  }, [column.title]);

  function commitColumn(event?: FormEvent) {
    event?.preventDefault();
    const next = title.trim() || 'Untitled';
    setTitle(next);
    if (next !== column.title) onRenameColumn(next);
  }

  function closeAdd() {
    setCardTitle('');
    setAdding(false);
  }

  // Enter keeps the form open so several cards can be typed in a row.
  function submitCard(event: FormEvent) {
    event.preventDefault();
    const next = cardTitle.trim();
    if (!next) {
      closeAdd();
      return;
    }
    setCardTitle('');
    onAddCard(next);
  }

  const columnClass = [
    'kanban-column',
    cardDrop ? 'drop-card' : '',
    columnDrop === true ? 'drop-after' : '',
    columnDrop === false ? 'drop-before' : '',
    dragging === column.id ? 'dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section
      className={columnClass}
      aria-label={column.title}
      onDragOver={(event) => {
        if (!editable) return;
        if (event.dataTransfer.types.includes(COLUMN_DRAG)) {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          onColumnDragOver(event.clientX > rect.left + rect.width / 2);
          return;
        }
        if (event.dataTransfer.types.includes(CARD_DRAG) && !(event.target as HTMLElement).closest('.kanban-card')) {
          event.preventDefault();
          onCardDragOver(null, true);
        }
      }}
      onDragLeave={(event) => {
        const related = event.relatedTarget as Node | null;
        if (related && event.currentTarget.contains(related)) return;
        onColumnDragLeave();
        onCardDragLeave();
      }}
      onDrop={(event) => {
        if (event.dataTransfer.types.includes(CARD_DRAG)) {
          if ((event.target as HTMLElement).closest('.kanban-card')) return;
          onCardDrop(event, null, true);
          return;
        }
        onColumnDrop(event);
      }}
    >
      <header className="kanban-column-head">
        {editable ? (
          <Button variant="plain"
            type="button"
            className="kanban-grip"
            draggable
            aria-label={`Drag column ${column.title}`}
            title="Drag to reorder"
            onDragStart={(event) => {
              event.stopPropagation();
              event.dataTransfer.setData(COLUMN_DRAG, column.id);
              event.dataTransfer.effectAllowed = 'move';
              const section = event.currentTarget.closest('section');
              if (section) event.dataTransfer.setDragImage(section, 20, 20);
              onDragStart(column.id);
            }}
            onDragEnd={onDragEnd}
          >
            <GripIcon />
          </Button>
        ) : null}
        <form onSubmit={commitColumn}>
          <input
            aria-label={`Column ${column.title}`}
            value={title}
            readOnly={!editable}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => commitColumn()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setTitle(column.title);
                event.currentTarget.blur();
              }
            }}
          />
        </form>
        <span className="kanban-count" aria-label={`${column.cards.length} cards`}>
          {column.cards.length}
        </span>
        {editable ? (
          <Button variant="plain"
            type="button"
            className="kanban-icon-btn danger"
            aria-label={`Delete column ${column.title}`}
            title="Delete column"
            onClick={onDeleteColumn}
          >
            <TrashIcon />
          </Button>
        ) : null}
      </header>
      <div
        className="kanban-cards"
        onDragOver={(event) => {
          if (!editable || !event.dataTransfer.types.includes(CARD_DRAG)) return;
          if ((event.target as HTMLElement).closest('.kanban-card')) return;
          event.preventDefault();
          onCardDragOver(null, true);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes(CARD_DRAG)) return;
          onCardDrop(event, null, true);
        }}
      >
        {column.cards.map((card) => (
          <CardView
            key={card.noteId}
            card={card}
            workspaceId={workspaceId}
            editable={editable}
            dragging={dragging === card.noteId}
            dropEdge={cardDrop?.cardId === card.noteId ? (cardDrop.after ? 'after' : 'before') : null}
            onDragStart={() => onDragStart(card.noteId)}
            onDragEnd={onDragEnd}
            onDragOverCard={(after) => onCardDragOver(card.noteId, after)}
            onDropOnCard={(event, after) => onCardDrop(event, card.noteId, after)}
            onRename={onRenameCard}
            onOpen={() => onOpenCard(card)}
            onRemove={onRemoveCard}
          />
        ))}
        {column.cards.length === 0 && !adding ? (
          <p className={`kanban-empty${cardDrop ? ' active' : ''}`}>{cardDrop ? 'Drop here' : 'No cards yet'}</p>
        ) : null}
        {cardDrop && cardDrop.cardId === null && column.cards.length > 0 ? (
          <div className="kanban-drop-tail" aria-hidden="true" />
        ) : null}
      </div>
      {editable ? (
        adding ? (
          <form className="kanban-add-card" onSubmit={submitCard}>
            <input
              aria-label="Card title"
              value={cardTitle}
              placeholder="What needs doing?"
              autoFocus
              onChange={(event) => setCardTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') closeAdd();
              }}
              onBlur={() => {
                if (!cardTitle.trim()) closeAdd();
              }}
            />
            <span className="kanban-form-actions">
              <Button type="submit">Add card</Button>
              <Button variant="plain" type="button" className="kanban-ghost" onMouseDown={(event) => event.preventDefault()} onClick={closeAdd}>
                Cancel
              </Button>
            </span>
          </form>
        ) : (
          <footer className="kanban-column-foot">
            <Button variant="plain" type="button" className="kanban-add-card-btn" onClick={() => setAdding(true)}>
              <PlusIcon />
              Add card
            </Button>
            <NotePicker
              open={picking}
              notes={notes}
              excludedIds={takenIds}
              onToggle={() => setPicking((value) => !value)}
              onClose={() => setPicking(false)}
              onPick={(id) => {
                setPicking(false);
                onPlaceNote(id);
              }}
            />
          </footer>
        )
      ) : null}
    </section>
  );
}

function CardView({
  card,
  workspaceId,
  editable,
  dragging,
  dropEdge,
  onDragStart,
  onDragEnd,
  onDragOverCard,
  onDropOnCard,
  onRename,
  onOpen,
  onRemove,
}: {
  card: KanbanCard;
  workspaceId: string;
  editable: boolean;
  dragging: boolean;
  dropEdge: 'before' | 'after' | null;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverCard: (after: boolean) => void;
  onDropOnCard: (event: DragEvent, after: boolean) => void;
  onRename: (note: PublicNote, title: string) => void;
  onOpen: () => void;
  onRemove: (card: KanbanCard) => void;
}) {
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(card.note.title);
  const href = `/w/${workspaceId}/n/${card.noteId}`;

  useEffect(() => {
    setTitle(card.note.title);
  }, [card.note.title]);

  function commit(event?: FormEvent) {
    event?.preventDefault();
    const next = title.trim() || 'Untitled';
    setTitle(next);
    setRenaming(false);
    onRename(card.note, next);
  }

  function cancel() {
    setTitle(card.note.title);
    setRenaming(false);
  }

  const className = [
    'kanban-card',
    editable && !renaming ? 'draggable' : '',
    dragging ? 'dragging' : '',
    dropEdge === 'before' ? 'drop-before' : '',
    dropEdge === 'after' ? 'drop-after' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      className={className}
      draggable={editable && !renaming}
      onDragStart={(event) => {
        event.dataTransfer.setData(CARD_DRAG, card.noteId);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (!editable || !event.dataTransfer.types.includes(CARD_DRAG)) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        onDragOverCard(event.clientY > rect.top + rect.height / 2);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes(CARD_DRAG)) return;
        const rect = event.currentTarget.getBoundingClientRect();
        onDropOnCard(event, event.clientY > rect.top + rect.height / 2);
      }}
      onClick={(event) => {
        if (renaming || (event.target as HTMLElement).closest('a, button, input, form')) return;
        // A nested board doesn't fit in the peek modal; go straight to its page.
        if (card.note.kind === 'kanban') navigate(href);
        else onOpen();
      }}
    >
      {renaming ? (
        <form className="kanban-card-rename" onSubmit={commit}>
          <input
            aria-label={`Title of ${card.note.title}`}
            value={title}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => commit()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancel();
            }}
          />
        </form>
      ) : (
        <div className="kanban-card-head">
          <NoteGlyph note={card.note} />
          <Link
            to={href}
            className="kanban-card-title"
            draggable={false}
            onClick={(event) => {
              // Plain clicks peek; modifier clicks keep normal link behaviour (new tab, etc.).
              if (card.note.kind === 'kanban' || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
                return;
              event.preventDefault();
              onOpen();
            }}
          >
            {card.note.title || 'Untitled'}
          </Link>
        </div>
      )}
      {card.note.excerpt && !renaming ? <p className="kanban-card-excerpt">{card.note.excerpt}</p> : null}
      {!renaming && (card.note.editable || editable) ? (
        <div className="kanban-card-tools">
          {card.note.editable ? (
            <Button variant="plain"
              type="button"
              className="kanban-icon-btn"
              aria-label={`Rename ${card.note.title}`}
              title="Rename"
              onClick={() => setRenaming(true)}
            >
              <PencilIcon />
            </Button>
          ) : null}
          {editable ? (
            <Button variant="plain"
              type="button"
              className="kanban-icon-btn danger"
              aria-label={`Remove ${card.note.title} from board`}
              title="Remove from board"
              onClick={() => onRemove(card)}
            >
              <CloseIcon />
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function NotePicker({
  open,
  notes,
  excludedIds,
  onToggle,
  onClose,
  onPick,
}: {
  open: boolean;
  notes: PublicNote[];
  excludedIds: Set<string>;
  onToggle: () => void;
  onClose: () => void;
  onPick: (noteId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const choices = notes
    .filter((note) => !excludedIds.has(note.id))
    .filter((note) => note.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title));

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, onClose]);

  return (
    <div className="kanban-picker" ref={rootRef}>
      <Button variant="plain"
        type="button"
        className="kanban-icon-btn"
        aria-expanded={open}
        aria-label="Add existing note"
        title="Add existing note"
        onClick={() => {
          setQuery('');
          onToggle();
        }}
      >
        <LinkNoteIcon />
      </Button>
      {open ? (
        <div className="kanban-picker-panel" role="dialog" aria-label="Add an existing note">
          <input
            type="search"
            aria-label="Search notes"
            placeholder="Search notes…"
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose();
              if (event.key === 'Enter' && choices[0]) {
                event.preventDefault();
                onPick(choices[0].id);
              }
            }}
          />
          {choices.length === 0 ? (
            <p className="muted">{query.trim() ? 'No matching notes.' : 'No other notes to add.'}</p>
          ) : (
            <ul>
              {choices.map((note) => {
                const trail = noteTrail(notes, note);
                return (
                  <li key={note.id}>
                    <Button variant="plain" type="button" className="kanban-picker-option" onClick={() => onPick(note.id)}>
                      <NoteGlyph note={note} />
                      <span className="kanban-picker-text">
                        <span>{note.title || 'Untitled'}</span>
                        {trail ? <span className="kanban-picker-trail">{trail}</span> : null}
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function GripIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="2.5" r="1" />
      <circle cx="8" cy="2.5" r="1" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="8" cy="6" r="1" />
      <circle cx="4" cy="9.5" r="1" />
      <circle cx="8" cy="9.5" r="1" />
    </svg>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function PlusIcon() {
  return (
    <Icon>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

function PencilIcon() {
  return (
    <Icon>
      <path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </Icon>
  );
}

function CloseIcon() {
  return (
    <Icon>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

function TrashIcon() {
  return (
    <Icon>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </Icon>
  );
}

function ExpandIcon() {
  return (
    <Icon>
      <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
    </Icon>
  );
}

function LinkNoteIcon() {
  return (
    <Icon>
      <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4Z" />
      <path d="M12 11v6M9 14h6" />
    </Icon>
  );
}
