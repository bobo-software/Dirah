import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import type { PublicMember } from '../../api/members';
import { TICKET_PRIORITIES, type Ticket, type TicketBoardView, type TicketPriority } from '../../api/tickets';
import { useTicketStore } from '../../stores/StoresIndex';
import { AssigneeCell } from './TicketCells';
import { PRIORITY_META } from './ticketMeta';

export type NewTicketDefaults = { groupId?: string; statusId?: string };

function parseLabels(raw: string): string[] {
  return raw
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean);
}

export function CreateTicketModal({
  view,
  members,
  defaults,
  onClose,
  onCreated,
}: {
  view: TicketBoardView;
  members: PublicMember[];
  defaults: NewTicketDefaults;
  onClose: () => void;
  onCreated: (ticket: Ticket) => void;
}) {
  const createTicket = useTicketStore((state) => state.createTicket);
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const statuses = [...view.statuses].sort((a, b) => a.position - b.position);
  const groups = [...view.groups].sort((a, b) => a.position - b.position);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [statusId, setStatusId] = useState(defaults.statusId ?? statuses[0]?.id ?? '');
  const [groupId, setGroupId] = useState(defaults.groupId ?? groups[0]?.id ?? '');
  const [priority, setPriority] = useState<TicketPriority>('none');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [labels, setLabels] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  async function onSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const ticket = await createTicket(view.board.id, {
        title: title.trim(),
        description,
        statusId,
        groupId,
        priority,
        assigneeIds,
        dueDate: dueDate || null,
        labels: parseLabels(labels),
      });
      onCreated(ticket);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create the ticket');
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => (!busy ? onClose() : undefined)}>
      <div
        className="modal ticket-create"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>New ticket</h2>
        <form
          className="ticket-create-form"
          onSubmit={(event) => void onSubmit(event)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void onSubmit();
          }}
        >
          <label>
            Title
            <input
              ref={inputRef}
              value={title}
              maxLength={300}
              placeholder="What needs doing?"
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>
          <label>
            Description
            <textarea
              className="ticket-textarea"
              rows={5}
              value={description}
              placeholder="Details, acceptance criteria, links… Markdown supported."
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="ticket-create-grid">
            <label>
              Status
              <select value={statusId} onChange={(event) => setStatusId(event.target.value)}>
                {statuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select value={priority} onChange={(event) => setPriority(event.target.value as TicketPriority)}>
                {TICKET_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {PRIORITY_META[value].label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Group
              <select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Due date
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </label>
          </div>
          <div className="ticket-create-field">
            <span>Assignees</span>
            <AssigneeCell assigneeIds={assigneeIds} members={members} editable emptyLabel="Add people" onChange={setAssigneeIds} />
          </div>
          <label>
            Labels
            <input
              value={labels}
              placeholder="design, backend"
              onChange={(event) => setLabels(event.target.value)}
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
            <button type="submit" disabled={busy || !title.trim()}>
              {busy ? 'Creating…' : 'Create ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
