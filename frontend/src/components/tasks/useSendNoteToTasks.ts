import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTaskStore } from '../../stores/StoresIndex';

/**
 * Copies a note's list lines into a new checklist and opens it. `beforeSend`
 * lets the editor flush unsaved typing first, since the server reads the
 * stored note body.
 */
export function useSendNoteToTasks(workspaceId: string) {
  const navigate = useNavigate();
  const createFromNote = useTaskStore((state) => state.createFromNote);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(noteId: string, beforeSend?: () => Promise<void>) {
    setSending(true);
    setError(null);
    try {
      await beforeSend?.();
      const view = await createFromNote(noteId);
      navigate(`/w/${workspaceId}/tasks/${view.list.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send this note to Tasks');
      setSending(false);
    }
  }

  return { send, sending, error, clearError: () => setError(null) };
}
