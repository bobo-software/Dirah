import { useParams } from 'react-router-dom';
import { NoteEditor } from '../../components/ComponentsIndex';
import { useWorkspaceStore } from '../../stores/StoresIndex';

export function NotePage() {
  const { workspaceId = '', noteId = '' } = useParams();
  const encrypted = useWorkspaceStore((state) =>
    state.workspaces.some((workspace) => workspace.id === workspaceId && workspace.encrypted)
  );
  if (encrypted) {
    return <p className="muted note-page-empty">Notes aren’t available in encrypted workspaces yet.</p>;
  }
  // Keyed so each note mounts with fresh editor and save state.
  return <NoteEditor key={noteId} workspaceId={workspaceId} noteId={noteId} />;
}
