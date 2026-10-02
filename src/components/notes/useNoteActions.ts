import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { NoteKind, PublicNote } from '../../api/client';
import { EMPTY_NOTES, useNoteStore } from '../../stores/StoresIndex';
import type { DropZone } from './noteTreeModel';

export function useNoteActions(workspaceId: string) {
  const navigate = useNavigate();
  const { noteId } = useParams();
  const notes = useNoteStore((state) => state.byWorkspace[workspaceId] ?? EMPTY_NOTES);
  const createNote = useNoteStore((state) => state.createNote);
  const patchNote = useNoteStore((state) => state.patchNote);
  const trashNote = useNoteStore((state) => state.trashNote);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function create(parent?: PublicNote, input?: { title?: string; kind?: NoteKind }) {
    setBusy(true);
    setMessage(null);
    try {
      const note = await createNote(workspaceId, {
        parentId: parent?.id ?? null,
        title: input?.title,
        kind: input?.kind,
      });
      navigate(`/w/${workspaceId}/n/${note.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create note');
    } finally {
      setBusy(false);
    }
  }

  async function trash(note: PublicNote) {
    if (!window.confirm(`Move “${note.title}” and its sub-notes to trash?`)) return;
    try {
      await trashNote(note.id);
      // Trashing removes the whole subtree; leave the open note if it went with it.
      const remaining = useNoteStore.getState().byWorkspace[workspaceId] ?? EMPTY_NOTES;
      if (noteId && !remaining.some((item) => item.id === noteId)) {
        navigate(`/w/${workspaceId}`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not trash note');
    }
  }

  async function move(draggedId: string, target: PublicNote, zone: DropZone) {
    const dragged = notes.find((note) => note.id === draggedId);
    if (!dragged) return;
    setMessage(null);
    try {
      if (zone === 'inside') {
        if (dragged.parentId === target.id) return;
        await patchNote(draggedId, { parentId: target.id });
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

  return { notes, busy, message, create, trash, move };
}
