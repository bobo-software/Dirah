import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PublicNote } from '../../api/client';
import { EMPTY_NOTES, useNoteStore, useWorkspaceStore } from '../../stores/StoresIndex';
import { NoteTree } from './NoteTree';
import { buildNoteTree, type DropZone } from './noteTreeModel';

export function NotesHome({ workspaceId }: { workspaceId: string }) {
  const navigate = useNavigate();
  const notes = useNoteStore((state) => state.byWorkspace[workspaceId] ?? EMPTY_NOTES);
  const loaded = useNoteStore((state) => state.loadedWorkspaces.has(workspaceId));
  const fetchNotes = useNoteStore((state) => state.fetchNotes);
  const createNote = useNoteStore((state) => state.createNote);
  const patchNote = useNoteStore((state) => state.patchNote);
  const trashNote = useNoteStore((state) => state.trashNote);
  const encrypted = useWorkspaceStore((state) =>
    state.workspaces.some((workspace) => workspace.id === workspaceId && workspace.encrypted)
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (encrypted) return;
    void fetchNotes(workspaceId).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Could not load notes');
    });
  }, [workspaceId, encrypted, fetchNotes]);

  const tree = useMemo(() => buildNoteTree(notes), [notes]);

  if (encrypted) {
    return <p className="muted home-empty-state">Notes aren’t available in encrypted workspaces yet.</p>;
  }

  function expand(noteId: string) {
    setExpandedIds((current) => new Set(current).add(noteId));
  }

  function onToggleExpand(noteId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  }

  async function onCreate(parent?: PublicNote) {
    setBusy(true);
    setMessage(null);
    try {
      const note = await createNote(workspaceId, { parentId: parent?.id ?? null });
      if (parent) expand(parent.id);
      navigate(`/w/${workspaceId}/n/${note.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create note');
    } finally {
      setBusy(false);
    }
  }

  async function onTrash(note: PublicNote) {
    if (!window.confirm(`Move “${note.title}” and its sub-notes to trash?`)) return;
    try {
      await trashNote(note.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not trash note');
    }
  }

  async function onMove(draggedId: string, target: PublicNote, zone: DropZone) {
    const dragged = notes.find((note) => note.id === draggedId);
    if (!dragged) return;
    setMessage(null);
    try {
      if (zone === 'inside') {
        if (dragged.parentId === target.id) return;
        await patchNote(draggedId, { parentId: target.id });
        expand(target.id);
        return;
      }
      // Positions are per author, so only renumber my own siblings.
      const parentId = target.parentId;
      const siblings = notes
        .filter((note) => note.parentId === parentId && note.editable && note.id !== draggedId)
        .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
      const index = siblings.findIndex((note) => note.id === target.id) + (zone === 'after' ? 1 : 0);
      siblings.splice(index, 0, dragged);
      for (const [position, note] of siblings.entries()) {
        if (note.id === draggedId) {
          if (note.parentId !== parentId || note.position !== position) {
            await patchNote(note.id, { parentId, position });
          }
        } else if (note.position !== position) {
          await patchNote(note.id, { position });
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not move note');
    }
  }

  return (
    <section className="notes-home" aria-label="Notes">
      <div className="notes-home-head">
        <p className="muted">Your notes are private unless you share them. Drag to reorder or nest.</p>
        <button type="button" onClick={() => void onCreate()} disabled={busy}>
          New note
        </button>
      </div>
      {message ? (
        <p className="error" role="alert">
          {message}
        </p>
      ) : null}
      {!loaded ? (
        <p className="muted">Loading notes…</p>
      ) : tree.length === 0 ? (
        <p className="muted home-empty-state">No notes yet.</p>
      ) : (
        <NoteTree
          nodes={tree}
          workspaceId={workspaceId}
          expandedIds={expandedIds}
          onToggleExpand={onToggleExpand}
          onCreateChild={(parent) => void onCreate(parent)}
          onTrash={(note) => void onTrash(note)}
          onMove={(draggedId, target, zone) => void onMove(draggedId, target, zone)}
        />
      )}
    </section>
  );
}
