import { type FormEvent, type KeyboardEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useTaskStore } from '../../stores/StoresIndex';
import type { TaskItem } from '../../api/tasks';
import { TaskProgress } from '../../components/tasks/TaskProgress';
import { taskMode } from '../../components/tasks/runner/modes';
import { confirmDelete } from '../../components/layout/deleteDialogue';
import { canEdit, type WorkspaceOutlet } from '../workspaceContext';
import { Button } from '../../components/buttons/Button';

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function TaskListPage() {
  const { workspaceId = '', listId = '' } = useParams();
  const navigate = useNavigate();
  const { role } = useOutletContext<WorkspaceOutlet>();
  const view = useTaskStore((state) => state.views[listId]);
  const fetchList = useTaskStore((state) => state.fetchList);
  const patchList = useTaskStore((state) => state.patchList);
  const deleteList = useTaskStore((state) => state.deleteList);
  const addItems = useTaskStore((state) => state.addItems);
  const moveItem = useTaskStore((state) => state.moveItem);
  const resetList = useTaskStore((state) => state.resetList);
  const setChecked = useTaskStore((state) => state.setChecked);
  const renameItem = useTaskStore((state) => state.renameItem);
  const removeItem = useTaskStore((state) => state.removeItem);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    void fetchList(listId).then(
      () => setLoadError(null),
      (err: unknown) => setLoadError(message(err, 'Could not load this list'))
    );
  }, [listId, fetchList]);

  if (!view) {
    return <p className={loadError ? 'error note-page-empty' : 'muted note-page-empty'}>{loadError ?? 'Loading list…'}</p>;
  }

  const { list, items } = view;
  const mode = taskMode(list.mode);
  const canEditItems = list.editable || (list.visibility === 'workspace' && canEdit(role));

  function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    action().catch((err: unknown) => setError(message(err, fallback)));
  }

  async function onAdd(event?: FormEvent) {
    event?.preventDefault();
    const texts = draft.split('\n').map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ xX]?\])\s*/, '').trim()).filter(Boolean);
    if (texts.length === 0) return;
    setAdding(true);
    setError(null);
    try {
      await addItems(listId, texts);
      setDraft('');
    } catch (err) {
      setError(message(err, 'Could not add items'));
    } finally {
      setAdding(false);
    }
  }

  function onDraftKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void onAdd();
    }
  }

  function commitTitle() {
    if (titleDraft === null) return;
    const next = titleDraft.trim() || 'Untitled';
    setTitleDraft(null);
    if (next !== list.title) run(() => patchList(listId, { title: next }), 'Could not rename the list');
  }

  function startEdit(item: TaskItem) {
    setEditingId(item.id);
    setEditValue(item.text);
  }

  function commitEdit(item: TaskItem) {
    const next = editValue.trim();
    setEditingId(null);
    if (next && next !== item.text) run(() => renameItem(listId, item.id, next), 'Could not rename the item');
  }

  function onDelete() {
    void confirmDelete({
      title: 'Delete list?',
      message: `Delete “${list.title}” and its ${items.length} items?`,
    }).then((confirmed) => {
      if (!confirmed) return;
      deleteList(listId).then(
        () => navigate(`/w/${workspaceId}/tasks`),
        (err: unknown) => setError(message(err, 'Could not delete the list'))
      );
    });
  }

  return (
    <div className="home-landing task-list-page">
      <Link className="task-back" to={`/w/${workspaceId}/tasks`}>
        ← All lists
      </Link>
      {list.editable ? (
        <input
          className="task-title-input"
          aria-label="List title"
          value={titleDraft ?? list.title}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') setTitleDraft(null);
          }}
        />
      ) : (
        <h1 className="home-landing-title">{list.title}</h1>
      )}

      <div className="task-list-meta">
        <span className="muted">
          {list.checkedCount} of {list.itemCount} checked
        </span>
        {list.editable ? (
          <label className="task-visibility">
            <span className="muted">Visible to</span>
            <select
              value={list.visibility}
              onChange={(event) =>
                run(
                  () => patchList(listId, { visibility: event.target.value as 'private' | 'workspace' }),
                  'Could not change visibility'
                )
              }
            >
              <option value="private">Only me</option>
              <option value="workspace">Workspace</option>
            </select>
          </label>
        ) : (
          <span className="muted">Shared list</span>
        )}
      </div>
      <TaskProgress checked={list.checkedCount} total={list.itemCount} />

      <div className="task-list-actions">
        {items.length > 0 ? (
          <Link className="task-run-cta" to={`/w/${workspaceId}/tasks/${listId}/run`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
            </svg>
            {mode.runLabel}
          </Link>
        ) : null}
        {list.checkedCount > 0 ? (
          <Button variant="link" type="button" onClick={() => run(() => resetList(listId), 'Could not reset the list')}>
            Uncheck all
          </Button>
        ) : null}
        {list.editable ? (
          <Button variant="link" type="button" className="danger" onClick={onDelete}>
            Delete list
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="muted home-empty-state">No items yet.{canEditItems ? ' Add some below, one per line.' : ''}</p>
      ) : (
        <ul className="task-items">
          {items.map((item, index) => (
            <li key={item.id} className={item.checked ? 'task-item checked' : 'task-item'}>
              <input
                type="checkbox"
                checked={item.checked}
                aria-label={item.text}
                onChange={(event) => run(() => setChecked(listId, item.id, event.target.checked), 'Could not save')}
              />
              {editingId === item.id ? (
                <input
                  className="task-item-input"
                  autoFocus
                  value={editValue}
                  maxLength={500}
                  onChange={(event) => setEditValue(event.target.value)}
                  onBlur={() => commitEdit(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                    if (event.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : canEditItems ? (
                <Button variant="plain" type="button" className="task-plain task-item-text" onClick={() => startEdit(item)} title="Edit">
                  {item.text}
                </Button>
              ) : (
                <span className="task-item-text">{item.text}</span>
              )}
              {canEditItems ? (
                <span className="task-item-tools">
                  <Button variant="plain"
                    type="button"
                    className="task-plain task-item-tool"
                    aria-label={`Move “${item.text}” up`}
                    disabled={index === 0}
                    onClick={() => run(() => moveItem(listId, item.id, -1), 'Could not reorder')}
                  >
                    ↑
                  </Button>
                  <Button variant="plain"
                    type="button"
                    className="task-plain task-item-tool"
                    aria-label={`Move “${item.text}” down`}
                    disabled={index === items.length - 1}
                    onClick={() => run(() => moveItem(listId, item.id, 1), 'Could not reorder')}
                  >
                    ↓
                  </Button>
                  <Button variant="plain"
                    type="button"
                    className="task-plain task-item-tool danger"
                    aria-label={`Delete “${item.text}”`}
                    onClick={() => {
                      void confirmDelete({
                        title: 'Delete item?',
                        message: `Delete “${item.text}”?`,
                      }).then((confirmed) => {
                        if (!confirmed) return;
                        run(() => removeItem(listId, item.id), 'Could not delete the item');
                      });
                    }}
                  >
                    ×
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEditItems ? (
        <form className="task-add" onSubmit={(event) => void onAdd(event)}>
          <label className="sidebar-label" htmlFor="task-add-input">
            Add items
          </label>
          <textarea
            id="task-add-input"
            rows={3}
            placeholder={'One item per line. Paste a whole list if you like.\nShift+Enter for a new line.'}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onDraftKey}
          />
          <Button type="submit" disabled={adding || !draft.trim()}>
            {adding ? 'Adding…' : 'Add'}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
