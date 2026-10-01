import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../stores/StoresIndex';

const MAX_LENGTH = 500;

function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19 4 20Z" />
      <path d="M13 7l4 4" />
    </svg>
  );
}

export function WorkspaceDescriptionEditor({
  workspaceId,
  description,
  editable,
}: {
  workspaceId: string;
  description: string | null;
  editable: boolean;
}) {
  const updateWorkspaceDescription = useWorkspaceStore((state) => state.updateWorkspaceDescription);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(description ?? '');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  function startEditing() {
    setValue(description ?? '');
    setMessage(null);
    setEditing(true);
  }

  async function onSave() {
    setPending(true);
    setMessage(null);
    try {
      await updateWorkspaceDescription(workspaceId, value.trim() || null);
      setEditing(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update description');
    } finally {
      setPending(false);
    }
  }

  if (editing) {
    return (
      <form
        className="home-description-edit"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave();
        }}
      >
        <textarea
          ref={textareaRef}
          aria-label="Workspace description"
          value={value}
          maxLength={MAX_LENGTH}
          placeholder="What is this workspace for?"
          disabled={pending}
          onChange={(event) => setValue(event.target.value)}
        />
        {message ? (
          <p className="error" role="alert">
            {message}
          </p>
        ) : null}
        <div className="folder-actions">
          <button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="linkish" disabled={pending} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  if (!description) {
    if (!editable) return null;
    return (
      <button type="button" className="linkish home-landing-description-empty" onClick={startEditing}>
        Add a description…
      </button>
    );
  }

  return (
    <p className="home-landing-description">
      {description}
      {editable ? (
        <button
          type="button"
          className="linkish icon-btn"
          aria-label="Edit description"
          title="Edit description"
          onClick={startEditing}
        >
          <EditIcon />
        </button>
      ) : null}
    </p>
  );
}
