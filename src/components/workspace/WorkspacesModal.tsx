import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { confirmDelete } from '../layout/deleteDialogue';
import { useWorkspaceStore } from '../../stores/StoresIndex';
import type { PublicWorkspace } from '../../api/client';

function RenameIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19 4 20Z" />
      <path d="M13 7l4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 7h15" />
      <path d="M9.5 7V4.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25V7" />
      <path d="M6.5 7.5l.9 12.15a1.5 1.5 0 0 0 1.5 1.35h6.2a1.5 1.5 0 0 0 1.5-1.35l.9-12.15" />
      <path d="M10.2 11v6.2" />
      <path d="M13.8 11v6.2" />
    </svg>
  );
}

export default function WorkspacesModal({
  open,
  onClose,
  currentId,
  onSelect,
  onCreated,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  currentId: string;
  onSelect: (id: string) => void;
  onCreated: (workspace: PublicWorkspace) => void;
  onDeleted: (id: string) => void;
}) {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace);
  const renameWorkspace = useWorkspaceStore((state) => state.renameWorkspace);
  const deleteWorkspace = useWorkspaceStore((state) => state.deleteWorkspace);
  const titleId = useId();
  const createRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const [createName, setCreateName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [pending, setPending] = useState<null | 'create' | 'rename' | 'delete'>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCreateName('');
    setRenamingId(null);
    setRenameValue('');
    setPending(null);
    setMessage(null);
    const timer = window.setTimeout(() => createRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && pending === null) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, pending, onClose]);

  useEffect(() => {
    if (renamingId) renameRef.current?.focus();
  }, [renamingId]);

  if (!open) return null;

  const busy = pending !== null;

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setPending('create');
    setMessage(null);
    try {
      const workspace = await createWorkspace(createName);
      onCreated(workspace);
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create workspace');
    } finally {
      setPending(null);
    }
  }

  async function onRename(workspace: PublicWorkspace) {
    setPending('rename');
    setMessage(null);
    try {
      await renameWorkspace(workspace.id, renameValue);
      setRenamingId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not rename workspace');
    } finally {
      setPending(null);
    }
  }

  async function onDelete(item: PublicWorkspace) {
    const confirmed = await confirmDelete({
      title: 'Delete workspace?',
      message: `Delete “${item.name}”? Pages in it are removed.`,
    });
    if (!confirmed) return;
    setPending('delete');
    setMessage(null);
    try {
      await deleteWorkspace(item.id);
      onDeleted(item.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not delete workspace');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => (!busy ? onClose() : undefined)}>
      <div
        className="modal workspace-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>Workspaces</h2>
        <ul className="workspace-modal-list">
          {workspaces.map((item) => {
            const owner = item.role === 'owner';
            const current = item.id === currentId;
            if (renamingId === item.id) {
              return (
                <li key={item.id} className={current ? 'current' : undefined}>
                  <form
                    className="workspace-inline-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void onRename(item);
                    }}
                  >
                    <input
                      ref={renameRef}
                      aria-label="Workspace name"
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      required
                      disabled={busy}
                    />
                    <button type="submit" disabled={busy}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="linkish"
                      disabled={busy}
                      onClick={() => setRenamingId(null)}
                    >
                      Cancel
                    </button>
                  </form>
                </li>
              );
            }
            return (
              <li key={item.id} className={current ? 'current' : undefined}>
                <button
                  type="button"
                  className="workspace-pick"
                  onClick={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                >
                  <span className="workspace-pick-name">{item.name}</span>
                  <span className="role-badge">{item.role}</span>
                </button>
                {owner ? (
                  <span className="workspace-pick-actions">
                    <button
                      type="button"
                      className="linkish icon-btn"
                      aria-label={`Rename ${item.name}`}
                      title="Rename"
                      disabled={busy}
                      onClick={() => {
                        setRenamingId(item.id);
                        setRenameValue(item.name);
                      }}
                    >
                      <RenameIcon />
                    </button>
                    <button
                      type="button"
                      className="linkish icon-btn danger"
                      aria-label={`Delete ${item.name}`}
                      title="Delete"
                      disabled={busy}
                      onClick={() => {
                        setRenamingId(null);
                        void onDelete(item);
                      }}
                    >
                      <TrashIcon />
                    </button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <form className="workspace-create-form" onSubmit={(event) => void onCreate(event)}>
          <label htmlFor="workspace-create-name">New workspace</label>
          <div className="workspace-inline-form">
            <input
              id="workspace-create-name"
              ref={createRef}
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Name"
              required
              disabled={busy}
            />
            <button type="submit" disabled={busy}>
              {pending === 'create' ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
        {message ? (
          <p className="error" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
