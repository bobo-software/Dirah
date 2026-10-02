import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { KanbanBoard, NoteEditor } from '../../components/ComponentsIndex';
import { EMPTY_NOTES, useNoteStore, useWorkspaceStore } from '../../stores/StoresIndex';

export function NotePage() {
  const { workspaceId = '', noteId = '' } = useParams();
  const encrypted = useWorkspaceStore((state) =>
    state.workspaces.some((workspace) => workspace.id === workspaceId && workspace.encrypted)
  );
  const notes = useNoteStore((state) => state.byWorkspace[workspaceId] ?? EMPTY_NOTES);
  const loaded = useNoteStore((state) => state.loadedWorkspaces.has(workspaceId));
  const fetchNotes = useNoteStore((state) => state.fetchNotes);

  useEffect(() => {
    if (!encrypted && !loaded) void fetchNotes(workspaceId);
  }, [encrypted, loaded, workspaceId, fetchNotes]);

  if (encrypted) {
    return <p className="muted note-page-empty">Notes aren’t available in encrypted workspaces yet.</p>;
  }
  const note = notes.find((item) => item.id === noteId);
  if (!note && !loaded) {
    return <p className="muted note-page-empty">Loading note…</p>;
  }
  // Keyed so each note mounts with fresh editor and save state.
  if (note?.kind === 'kanban') {
    return <KanbanBoard key={noteId} workspaceId={workspaceId} noteId={noteId} />;
  }
  return <NoteEditor key={noteId} workspaceId={workspaceId} noteId={noteId} />;
}
