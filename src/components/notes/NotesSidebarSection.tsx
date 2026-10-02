import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useNoteStore } from '../../stores/StoresIndex';
import { HomeIcon } from '../layout/SectionIcons';
import { NoteTree } from './NoteTree';
import { buildNoteTree } from './noteTreeModel';
import { useNoteActions } from './useNoteActions';

export function NotesSidebarSection({ workspaceId, noteId }: { workspaceId: string; noteId?: string }) {
  const loaded = useNoteStore((state) => state.loadedWorkspaces.has(workspaceId));
  const fetchNotes = useNoteStore((state) => state.fetchNotes);
  const { notes, busy, message, create, trash, move } = useNoteActions(workspaceId);
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [revealedId, setRevealedId] = useState<string | undefined>();

  useEffect(() => {
    void fetchNotes(workspaceId).then(
      () => setLoadError(null),
      (error: unknown) => setLoadError(error instanceof Error ? error.message : 'Could not load notes')
    );
  }, [workspaceId, fetchNotes]);

  // Open the path down to the active note once it is loaded, so it is visible in the tree.
  if (noteId !== revealedId && (!noteId || notes.some((note) => note.id === noteId))) {
    setRevealedId(noteId);
    const byId = new Map(notes.map((note) => [note.id, note]));
    const ancestors: string[] = [];
    for (let parentId = noteId && byId.get(noteId)?.parentId; parentId && byId.has(parentId); parentId = byId.get(parentId)?.parentId) {
      if (ancestors.includes(parentId)) break;
      ancestors.push(parentId);
    }
    if (ancestors.some((id) => !expandedIds.has(id))) {
      setExpandedIds(new Set([...expandedIds, ...ancestors]));
    }
  }

  const query = search.trim().toLowerCase();
  const tree = useMemo(
    () =>
      query
        ? notes
            .filter((note) => note.title.toLowerCase().includes(query))
            .map((note) => ({ note, children: [] }))
        : buildNoteTree(notes),
    [notes, query]
  );

  function expand(id: string) {
    setExpandedIds((current) => new Set(current).add(id));
  }

  function onToggleExpand(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const error = message ?? loadError;

  return (
    <>
      <NavLink className="sidebar-home" to={`/w/${workspaceId}`} end>
        <HomeIcon />
        <span>Home</span>
      </NavLink>
      <label className="sidebar-label" htmlFor="note-search">
        Search
      </label>
      <input
        id="note-search"
        type="search"
        placeholder="Search note titles"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="sidebar-pages-header">
        <p className="sidebar-label">Notes</p>
        <span className="header-creates">
          <button type="button" className="linkish" onClick={() => void create()} disabled={busy}>
            New
          </button>
        </span>
      </div>
      {!loaded ? (
        <p className="muted">Loading notes…</p>
      ) : tree.length === 0 ? (
        <p className="muted">{query ? 'No matching notes.' : 'No notes yet.'}</p>
      ) : (
        <NoteTree
          nodes={tree}
          workspaceId={workspaceId}
          activeId={noteId}
          expandedIds={expandedIds}
          onToggleExpand={onToggleExpand}
          onCreateChild={(parent) => {
            expand(parent.id);
            void create(parent);
          }}
          onCreateKanban={(parent) => {
            expand(parent.id);
            void create(parent, { kind: 'kanban', title: 'Kanban' });
          }}
          onTrash={(note) => void trash(note)}
          onMove={(draggedId, target, zone) => {
            if (zone === 'inside') expand(target.id);
            void move(draggedId, target, zone);
          }}
        />
      )}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
