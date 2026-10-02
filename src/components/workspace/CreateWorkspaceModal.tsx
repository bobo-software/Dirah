import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../stores/StoresIndex';
import type { PublicWorkspace } from '../../api/client';

export default function CreateWorkspaceModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (workspace: PublicWorkspace) => void;
}) {
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace);
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setMessage(null);
    setBusy(false);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const workspace = await createWorkspace(name);
      onCreated(workspace);
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create workspace');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => (!busy ? onClose() : undefined)}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>New workspace</h2>
        <form onSubmit={(event) => void onSubmit(event)}>
          <label>
            Workspace name
            <input
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          {message ? (
            <p className="error" role="alert">
              {message}
            </p>
          ) : null}
          <div className="modal-actions">
            <button type="button" className="linkish" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
