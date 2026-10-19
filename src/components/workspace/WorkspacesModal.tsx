import { type CSSProperties, type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { categoryHue } from '../docs/categoryColor';
import { confirmDelete } from '../layout/deleteDialogue';
import { useWorkspaceStore } from '../../stores/StoresIndex';
import type { PublicWorkspace } from '../../api/client';
import { Button } from '../buttons/Button';

function RenameIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19 4 20Z" />
      <path d="M13 7l4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
  const searchRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [createName, setCreateName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [pending, setPending] = useState<null | 'create' | 'rename' | 'delete'>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCreateName('');
    setRenamingId(null);
    setRenameValue('');
    setPending(null);
    setMessage(null);
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
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
  const needle = query.trim().toLowerCase();
  const visible = workspaces.filter(
    (item) => !needle || item.name.toLowerCase().includes(needle) || item.description?.toLowerCase().includes(needle)
  );

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
      message: `“${item.name}” and everything in it disappears for all members now, and is permanently deleted after 48 hours.`,
      confirmText: item.name,
      confirmLabel: 'Delete workspace',
    });
    if (!confirmed) return;
    setPending('delete');
    setMessage(null);
    try {
      await deleteWorkspace(item.id, item.name);
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
        <div className="workspace-modal-head">
          <h2 id={titleId}>Workspaces</h2>
          <span className="muted workspace-modal-count">{workspaces.length}</span>
        </div>
        <input
          ref={searchRef}
          type="search"
          className="workspace-modal-search"
          placeholder="Search workspaces"
          aria-label="Search workspaces"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul className="workspace-modal-list">
          {visible.length === 0 ? <li className="muted workspace-modal-empty">No workspaces match.</li> : null}
          {visible.map((item) => {
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
                    <Button type="submit" disabled={busy}>
                      Save
                    </Button>
                    <Button variant="link"
                      type="button"
                      disabled={busy}
                      onClick={() => setRenamingId(null)}
                    >
                      Cancel
                    </Button>
                  </form>
                </li>
              );
            }
            return (
              <li key={item.id} className={current ? 'current' : undefined}>
                <Button variant="plain"
                  type="button"
                  className="workspace-pick"
                  onClick={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                >
                  <span
                    className="workspace-pick-tile"
                    style={{ '--card-hue': categoryHue(item.id) } as CSSProperties}
                    aria-hidden="true"
                  >
                    {item.name.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <span className="workspace-pick-text">
                    <span className="workspace-pick-name">{item.name}</span>
                    {item.description ? <span className="workspace-pick-desc muted">{item.description}</span> : null}
                  </span>
                  {current ? <span className="workspace-pick-current">Current</span> : null}
                  {item.encrypted ? <span className="role-badge">encrypted</span> : null}
                  <span className="role-badge">{item.role}</span>
                </Button>
                {owner ? (
                  <span className="workspace-pick-actions">
                    <Button variant="plain"
                      type="button"
                      className="workspace-pick-action"
                      aria-label={`Rename ${item.name}`}
                      title="Rename"
                      disabled={busy}
                      onClick={() => {
                        setRenamingId(item.id);
                        setRenameValue(item.name);
                      }}
                    >
                      <RenameIcon />
                    </Button>
                    <Button variant="plain"
                      type="button"
                      className="workspace-pick-action danger"
                      aria-label={`Delete ${item.name}`}
                      title="Delete"
                      disabled={busy}
                      onClick={() => {
                        setRenamingId(null);
                        void onDelete(item);
                      }}
                    >
                      <TrashIcon />
                    </Button>
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
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Name"
              required
              disabled={busy}
            />
            <Button type="submit" disabled={busy}>
              {pending === 'create' ? 'Creating…' : 'Create'}
            </Button>
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
