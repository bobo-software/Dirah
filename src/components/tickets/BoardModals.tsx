import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import {
  TICKET_STATUS_CATEGORIES,
  type TicketBoardView,
  type TicketGroup,
  type TicketStatus,
  type TicketStatusCategory,
} from '../../api/tickets';
import { useTicketStore } from '../../stores/StoresIndex';
import { confirmDelete } from '../layout/deleteDialogue';
import { ColorDot } from '../notes/table/ColorDot';
import { SELECT_COLORS, type SelectColor } from '../notes/table/columnTypes';
import { BOARD_KEY_RE, STATUS_CATEGORY_LABEL, suggestKey } from './ticketMeta';

function useEscape(onClose: () => void, disabled: boolean) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !disabled) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, disabled]);
}

export function CreateBoardModal({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreated: (view: TicketBoardView) => void;
}) {
  const createBoard = useTicketStore((state) => state.createBoard);
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEscape(onClose, busy);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const effectiveKey = keyTouched ? key : name.trim() ? suggestKey(name) : '';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (effectiveKey && !BOARD_KEY_RE.test(effectiveKey)) {
      setMessage('The key must be 2–10 letters or digits and start with a letter.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      // Without a touched key, let the server pick a free one (it adds a number on clashes).
      const view = await createBoard(workspaceId, { name, key: keyTouched ? effectiveKey : undefined });
      onCreated(view);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create the board');
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => (!busy ? onClose() : undefined)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <h2 id={titleId}>New board</h2>
        <form onSubmit={(event) => void onSubmit(event)}>
          <label>
            Board name
            <input ref={inputRef} value={name} maxLength={120} placeholder="Product roadmap" onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Ticket key
            <input
              value={effectiveKey}
              maxLength={10}
              placeholder="PR"
              onChange={(event) => {
                setKeyTouched(true);
                setKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
              }}
            />
            <small className="muted">Tickets will be numbered {effectiveKey || 'KEY'}-1, {effectiveKey || 'KEY'}-2, …</small>
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
            <button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create board'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function BoardSettingsModal({
  view,
  onClose,
  onDeleted,
}: {
  view: TicketBoardView;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const patchBoard = useTicketStore((state) => state.patchBoard);
  const deleteBoard = useTicketStore((state) => state.deleteBoard);
  const titleId = useId();
  const boardId = view.board.id;
  const [name, setName] = useState(view.board.name);
  const [key, setKey] = useState(view.board.key);
  const [description, setDescription] = useState(view.board.description ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEscape(onClose, busy);

  function fail(error: unknown, fallback: string) {
    setMessage(error instanceof Error ? error.message : fallback);
  }

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (!BOARD_KEY_RE.test(key)) {
      setMessage('The key must be 2–10 letters or digits and start with a letter.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await patchBoard(boardId, { name, key, description: description.trim() || null });
    } catch (error) {
      fail(error, 'Could not save the board');
    } finally {
      setBusy(false);
    }
  }

  async function removeBoard() {
    const ok = await confirmDelete({
      title: `Delete “${view.board.name}”?`,
      message: `The board and its ${view.board.ticketCount} ticket${view.board.ticketCount === 1 ? '' : 's'} will be removed for everyone.`,
      confirmLabel: 'Delete board',
    });
    if (!ok) return;
    try {
      await deleteBoard(boardId);
      onDeleted();
    } catch (error) {
      fail(error, 'Could not delete the board');
    }
  }

  const statuses = [...view.statuses].sort((a, b) => a.position - b.position);
  const groups = [...view.groups].sort((a, b) => a.position - b.position);

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => (!busy ? onClose() : undefined)}>
      <div
        className="modal ticket-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>Board settings</h2>
        <form className="ticket-settings-section" onSubmit={(event) => void saveDetails(event)}>
          <label>
            Name
            <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Ticket key
            <input
              value={key}
              maxLength={10}
              onChange={(event) => setKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
            {key !== view.board.key ? (
              <small className="muted">
                Existing tickets become {key || 'KEY'}-1, {key || 'KEY'}-2, … Links using {view.board.key}- keys will stop resolving.
              </small>
            ) : null}
          </label>
          <label>
            Description
            <textarea rows={2} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <div className="modal-actions">
            <button type="submit" disabled={busy}>
              Save
            </button>
          </div>
        </form>

        <OrderedList
          title="Statuses"
          hint="Statuses are the kanban columns. Category decides what counts as open or done."
          items={statuses}
          onReorder={(ids) => useTicketStore.getState().orderStatuses(boardId, ids).catch((error: unknown) => fail(error, 'Could not reorder'))}
          onAdd={(itemName) =>
            useTicketStore
              .getState()
              .createStatus(boardId, { name: itemName, color: SELECT_COLORS[statuses.length % SELECT_COLORS.length] })
              .catch((error: unknown) => fail(error, 'Could not add the status'))
          }
          renderRow={(status) => (
            <StatusRow
              key={status.id}
              status={status as TicketStatus}
              others={statuses.filter((item) => item.id !== status.id)}
              count={view.tickets.filter((ticket) => ticket.statusId === status.id).length}
              onError={setMessage}
            />
          )}
        />

        <OrderedList
          title="Groups"
          hint="Groups are the sections of the table view, e.g. sprints or themes."
          items={groups}
          onReorder={(ids) => useTicketStore.getState().orderGroups(boardId, ids).catch((error: unknown) => fail(error, 'Could not reorder'))}
          onAdd={(itemName) =>
            useTicketStore
              .getState()
              .createGroup(boardId, { name: itemName, color: SELECT_COLORS[(groups.length + 6) % SELECT_COLORS.length] })
              .catch((error: unknown) => fail(error, 'Could not add the group'))
          }
          renderRow={(group) => (
            <GroupRow
              key={group.id}
              group={group as TicketGroup}
              others={groups.filter((item) => item.id !== group.id)}
              count={view.tickets.filter((ticket) => ticket.groupId === group.id).length}
              onError={setMessage}
            />
          )}
        />

        {message ? (
          <p className="error" role="alert">
            {message}
          </p>
        ) : null}

        <div className="modal-actions ticket-settings-foot">
          <button type="button" className="linkish danger" onClick={() => void removeBoard()}>
            Delete board
          </button>
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderedList<T extends { id: string; name: string }>({
  title,
  hint,
  items,
  onReorder,
  onAdd,
  renderRow,
}: {
  title: string;
  hint: string;
  items: T[];
  onReorder: (ids: string[]) => void;
  onAdd: (name: string) => void;
  renderRow: (item: T, index: number) => React.ReactNode;
}) {
  const [draft, setDraft] = useState('');

  function move(index: number, offset: number) {
    const ids = items.map((item) => item.id);
    const to = index + offset;
    if (to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ...ids.splice(index, 1));
    onReorder(ids);
  }

  return (
    <section className="ticket-settings-section" aria-label={title}>
      <h3 className="ticket-panel-heading">{title}</h3>
      <p className="muted ticket-settings-hint">{hint}</p>
      <ul className="ticket-settings-list">
        {items.map((item, index) => (
          <li key={item.id} className="ticket-settings-row">
            <span className="ticket-settings-move">
              <button type="button" aria-label={`Move ${item.name} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${item.name} down`}
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
            </span>
            {renderRow(item, index)}
          </li>
        ))}
      </ul>
      <form
        className="note-type-create"
        onSubmit={(event) => {
          event.preventDefault();
          const value = draft.trim();
          if (!value) return;
          onAdd(value);
          setDraft('');
        }}
      >
        <input placeholder={`New ${title.toLowerCase().replace(/es$|s$/, '')}`} aria-label={`New ${title}`} value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button type="submit">Add</button>
      </form>
    </section>
  );
}

function NameInput({ value, label, onSave }: { value: string; label: string; onSave: (name: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      className="ticket-settings-name"
      aria-label={label}
      value={draft}
      maxLength={80}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (next && next !== value) onSave(next);
        else setDraft(value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

/** Deleting a status or group that still holds tickets asks where they should go. */
function MoveTargetDelete({
  label,
  count,
  others,
  onDelete,
}: {
  label: string;
  count: number;
  others: { id: string; name: string }[];
  onDelete: (moveTo?: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState(others[0]?.id ?? '');
  if (others.length === 0) return null;
  if (!picking) {
    return (
      <button
        type="button"
        className="linkish danger"
        aria-label={`Delete ${label}`}
        onClick={async () => {
          if (count > 0) {
            setPicking(true);
            return;
          }
          const ok = await confirmDelete({ title: `Delete “${label}”?`, message: 'It has no tickets.', confirmLabel: 'Delete' });
          if (ok) onDelete();
        }}
      >
        Delete
      </button>
    );
  }
  return (
    <span className="ticket-move-target">
      <label>
        Move {count} to
        <select value={target} onChange={(event) => setTarget(event.target.value)}>
          {others.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="linkish danger" onClick={() => onDelete(target)}>
        Delete
      </button>
      <button type="button" className="linkish" onClick={() => setPicking(false)}>
        Cancel
      </button>
    </span>
  );
}

function StatusRow({
  status,
  others,
  count,
  onError,
}: {
  status: TicketStatus;
  others: TicketStatus[];
  count: number;
  onError: (message: string) => void;
}) {
  const store = useTicketStore.getState;
  const fail = (error: unknown) => onError(error instanceof Error ? error.message : 'Could not update the status');
  return (
    <>
      <ColorDot
        color={status.color as SelectColor}
        name={status.name}
        onChange={(color) => store().patchStatus(status.boardId, status.id, { color }).catch(fail)}
      />
      <NameInput
        key={status.name}
        value={status.name}
        label="Status name"
        onSave={(name) => store().patchStatus(status.boardId, status.id, { name }).catch(fail)}
      />
      <select
        aria-label={`Category for ${status.name}`}
        value={status.category}
        onChange={(event) =>
          store()
            .patchStatus(status.boardId, status.id, { category: event.target.value as TicketStatusCategory })
            .catch(fail)
        }
      >
        {TICKET_STATUS_CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {STATUS_CATEGORY_LABEL[category]}
          </option>
        ))}
      </select>
      <MoveTargetDelete
        label={status.name}
        count={count}
        others={others}
        onDelete={(moveTo) => store().deleteStatus(status.boardId, status.id, moveTo).catch(fail)}
      />
    </>
  );
}

function GroupRow({
  group,
  others,
  count,
  onError,
}: {
  group: TicketGroup;
  others: TicketGroup[];
  count: number;
  onError: (message: string) => void;
}) {
  const store = useTicketStore.getState;
  const fail = (error: unknown) => onError(error instanceof Error ? error.message : 'Could not update the group');
  return (
    <>
      <ColorDot
        color={group.color as SelectColor}
        name={group.name}
        onChange={(color) => store().patchGroup(group.boardId, group.id, { color }).catch(fail)}
      />
      <NameInput key={group.name} value={group.name} label="Group name" onSave={(name) => store().patchGroup(group.boardId, group.id, { name }).catch(fail)} />
      <MoveTargetDelete
        label={group.name}
        count={count}
        others={others}
        onDelete={(moveTo) => store().deleteGroup(group.boardId, group.id, moveTo).catch(fail)}
      />
    </>
  );
}
