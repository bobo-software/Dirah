import { useState, type MouseEvent, type ReactNode } from 'react';
import type { PublicMember } from '../../../api/members';
import type { Ticket, TicketBoardView, TicketPatch } from '../../../api/tickets';
import { RichMarkdownInput } from '../../editor/RichMarkdownInput';
import { AssigneeCell, DueCell, PriorityCell, StatusCell } from '../TicketCells';
import { MenuTrigger, OptionMenu } from '../TicketMenus';
import { TicketMarkdown } from '../TicketMarkdown';
import { memberLabel, timeAgo } from '../ticketMeta';
import { CalendarIcon, GroupIcon, PeopleIcon, PriorityIcon, StatusIcon, TagIcon } from './ViewerIcons';
import { Button } from '../../buttons/Button';

export function TicketTitle({ title, editable, onSave }: { title: string; editable: boolean; onSave: (title: string) => void }) {
  const [draft, setDraft] = useState(title);
  if (!editable) return <h2 className="ticket-viewer-title">{title}</h2>;
  return (
    <textarea
      className="ticket-viewer-title ticket-viewer-title-input"
      aria-label="Ticket title"
      rows={1}
      maxLength={300}
      value={draft}
      onChange={(event) => setDraft(event.target.value.replace(/\n/g, ' '))}
      onBlur={() => {
        const next = draft.trim();
        if (next && next !== title) onSave(next);
        else setDraft(title);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          event.stopPropagation();
          setDraft(title);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function Property({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="ticket-prop">
      <dt>
        {icon}
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

export function TicketProperties({
  view,
  ticket,
  members,
  editable,
  onPatch,
}: {
  view: TicketBoardView;
  ticket: Ticket;
  members: PublicMember[];
  editable: boolean;
  onPatch: (input: TicketPatch) => void;
}) {
  const byId = new Map(members.map((member) => [member.userId, member]));
  const status = view.statuses.find((item) => item.id === ticket.statusId);
  const group = view.groups.find((item) => item.id === ticket.groupId);
  const groupPill = <span className={`ticket-pill ticket-pill-soft note-type-${group?.color ?? 'gray'}`}>{group?.name ?? '—'}</span>;
  const names = ticket.assigneeIds.map((id) => memberLabel(byId.get(id))).join(', ');

  return (
    <section className="ticket-props" aria-label="Properties">
      <dl>
        <Property icon={<StatusIcon />} label="Status">
          <StatusCell status={status} statuses={view.statuses} editable={editable} onChange={(statusId) => onPatch({ statusId })} />
        </Property>
        <Property icon={<PriorityIcon />} label="Priority">
          <PriorityCell
            priority={ticket.priority}
            editable={editable}
            emptyLabel="No priority"
            onChange={(priority) => onPatch({ priority })}
          />
        </Property>
        <Property icon={<PeopleIcon />} label="Assignees">
          <span className="ticket-prop-people" title={names || undefined}>
            <AssigneeCell
              assigneeIds={ticket.assigneeIds}
              members={members}
              editable={editable}
              emptyLabel="Unassigned"
              onChange={(assigneeIds) => onPatch({ assigneeIds })}
            />
            {ticket.assigneeIds.length === 1 ? <span className="ticket-prop-name">{names}</span> : null}
          </span>
        </Property>
        <Property icon={<CalendarIcon />} label="Due date">
          <DueCell
            dueDate={ticket.dueDate}
            done={status?.category === 'done'}
            editable={editable}
            emptyLabel="No due date"
            onChange={(dueDate) => onPatch({ dueDate })}
          />
        </Property>
        <Property icon={<GroupIcon />} label="Group">
          {editable ? (
            <MenuTrigger
              className="ticket-cell-button"
              label={`Group: ${group?.name ?? 'none'}. Change group`}
              menu={(anchor, close) => (
                <OptionMenu
                  anchor={anchor}
                  label="Group"
                  value={ticket.groupId}
                  options={view.groups.map((item) => ({ id: item.id, label: item.name, color: item.color }))}
                  onSelect={(groupId) => onPatch({ groupId })}
                  onClose={close}
                />
              )}
            >
              {groupPill}
            </MenuTrigger>
          ) : (
            <span className="ticket-cell-static">{groupPill}</span>
          )}
        </Property>
        <Property icon={<TagIcon />} label="Labels">
          <TicketLabels labels={ticket.labels} editable={editable} onChange={(labels) => onPatch({ labels })} />
        </Property>
      </dl>
      <p className="ticket-props-meta">
        Created{' '}
        <time dateTime={ticket.createdAt} title={new Date(ticket.createdAt).toLocaleString()}>
          {new Date(ticket.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
        </time>
        {ticket.createdBy ? ` by ${memberLabel(byId.get(ticket.createdBy))}` : ''}
        {ticket.updatedAt !== ticket.createdAt ? (
          <>
            {' · '}Updated{' '}
            <time dateTime={ticket.updatedAt} title={new Date(ticket.updatedAt).toLocaleString()}>
              {timeAgo(ticket.updatedAt)}
            </time>
          </>
        ) : null}
      </p>
    </section>
  );
}

function TicketLabels({
  labels,
  editable,
  onChange,
}: {
  labels: string[];
  editable: boolean;
  onChange: (labels: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    const label = draft.trim();
    setDraft('');
    if (!label || labels.some((item) => item.toLowerCase() === label.toLowerCase())) return;
    onChange([...labels, label]);
  }

  return (
    <span className="ticket-labels-field">
      {labels.map((label) => (
        <span key={label} className="ticket-label">
          {label}
          {editable ? (
            <Button type="button" aria-label={`Remove label ${label}`} onClick={() => onChange(labels.filter((item) => item !== label))}>
              ×
            </Button>
          ) : null}
        </span>
      ))}
      {editable ? (
        <input
          className="ticket-label-input"
          aria-label="Add label"
          placeholder={labels.length ? '+ Add' : 'Add label'}
          maxLength={40}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={add}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add();
            }
          }}
        />
      ) : labels.length === 0 ? (
        <span className="ticket-empty">No labels</span>
      ) : null}
    </span>
  );
}

export function TicketDescription({
  workspaceId,
  description,
  editable,
  onSave,
}: {
  workspaceId: string;
  description: string;
  editable: boolean;
  onSave: (description: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing(event?: MouseEvent) {
    // Links, attachments and images inside the description keep their own click.
    if (event && (event.target as HTMLElement).closest('a, button, img')) return;
    setDraft(description);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    await onSave(draft);
    setBusy(false);
    setEditing(false);
  }

  return (
    <section className="ticket-viewer-section ticket-viewer-desc" aria-label="Description">
      <h3 className="ticket-viewer-heading">Description</h3>
      {editing ? (
        <>
          <RichMarkdownInput
            className="rich-input-tall"
            value={draft}
            onChange={setDraft}
            label="Description"
            placeholder="Details, acceptance criteria, links… Paste images straight in."
            workspaceId={workspaceId}
            autoFocus
            onSubmit={() => void save()}
            onError={setError}
            actions={({ uploading }) => (
              <>
                <Button variant="link" type="button" className="rich-input-hint" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void save()} disabled={busy || uploading}>
                  Save
                </Button>
              </>
            )}
          />
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      ) : editable ? (
        <div
          className={description.trim() ? 'ticket-desc-view is-editable' : 'ticket-desc-view is-editable is-empty'}
          role="button"
          tabIndex={0}
          aria-label="Edit description"
          onClick={startEditing}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.target === event.currentTarget) {
              event.preventDefault();
              startEditing();
            }
          }}
        >
          {description.trim() ? <TicketMarkdown>{description}</TicketMarkdown> : 'Add a description…'}
        </div>
      ) : description.trim() ? (
        <TicketMarkdown>{description}</TicketMarkdown>
      ) : (
        <p className="muted">No description.</p>
      )}
    </section>
  );
}
