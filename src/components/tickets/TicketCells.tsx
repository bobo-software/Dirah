import { useRef } from 'react';
import type { PublicMember } from '../../api/members';
import { TICKET_PRIORITIES, type TicketPriority, type TicketStatus } from '../../api/tickets';
import { Avatar, MemberPicker, MenuTrigger, OptionMenu } from './TicketMenus';
import { dueTone, formatDue, PRIORITY_META } from './ticketMeta';

const PRIORITY_OPTIONS = TICKET_PRIORITIES.map((priority) => ({
  id: priority,
  label: PRIORITY_META[priority].label,
  color: PRIORITY_META[priority].color,
}));

export function StatusCell({
  status,
  statuses,
  editable,
  onChange,
}: {
  status: TicketStatus | undefined;
  statuses: TicketStatus[];
  editable: boolean;
  onChange: (statusId: string) => void;
}) {
  const pill = <span className={`ticket-pill note-type-${status?.color ?? 'gray'}`}>{status?.name ?? '—'}</span>;
  if (!editable) return <span className="ticket-cell-static">{pill}</span>;
  return (
    <MenuTrigger
      className="ticket-cell-button"
      label={`Status: ${status?.name ?? 'none'}. Change status`}
      menu={(anchor, close) => (
        <OptionMenu
          anchor={anchor}
          label="Status"
          value={status?.id ?? ''}
          options={statuses.map((item) => ({ id: item.id, label: item.name, color: item.color }))}
          onSelect={onChange}
          onClose={close}
        />
      )}
    >
      {pill}
    </MenuTrigger>
  );
}

export function PriorityCell({
  priority,
  editable,
  onChange,
}: {
  priority: TicketPriority;
  editable: boolean;
  onChange: (priority: TicketPriority) => void;
}) {
  const meta = PRIORITY_META[priority];
  const pill =
    priority === 'none' ? (
      <span className="ticket-empty">—</span>
    ) : (
      <span className={`ticket-pill ticket-pill-soft note-type-${meta.color}`}>{meta.label}</span>
    );
  if (!editable) return <span className="ticket-cell-static">{pill}</span>;
  return (
    <MenuTrigger
      className="ticket-cell-button"
      label={`Priority: ${meta.label}. Change priority`}
      menu={(anchor, close) => (
        <OptionMenu
          anchor={anchor}
          label="Priority"
          value={priority}
          options={PRIORITY_OPTIONS}
          onSelect={(id) => onChange(id as TicketPriority)}
          onClose={close}
        />
      )}
    >
      {pill}
    </MenuTrigger>
  );
}

export function AssigneeCell({
  assigneeIds,
  members,
  editable,
  emptyLabel = '—',
  onChange,
}: {
  assigneeIds: string[];
  members: PublicMember[];
  editable: boolean;
  emptyLabel?: string;
  onChange: (ids: string[]) => void;
}) {
  const byId = new Map(members.map((member) => [member.userId, member]));
  const stack =
    assigneeIds.length === 0 ? (
      <span className="ticket-empty">{emptyLabel}</span>
    ) : (
      <span className="ticket-avatar-stack">
        {assigneeIds.slice(0, 3).map((id) => (
          <Avatar key={id} member={byId.get(id)} />
        ))}
        {assigneeIds.length > 3 ? <span className="ticket-avatar ticket-avatar-sm ticket-avatar-more">+{assigneeIds.length - 3}</span> : null}
      </span>
    );
  if (!editable) return <span className="ticket-cell-static">{stack}</span>;
  return (
    <MenuTrigger
      className="ticket-cell-button"
      label={`${assigneeIds.length} assigned. Change assignees`}
      menu={(anchor, close) => (
        <MemberPicker anchor={anchor} members={members} selected={assigneeIds} onChange={onChange} onClose={close} />
      )}
    >
      {stack}
    </MenuTrigger>
  );
}

export function DueCell({
  dueDate,
  done,
  editable,
  onChange,
}: {
  dueDate: string | null;
  done: boolean;
  editable: boolean;
  onChange: (date: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const tone = dueTone(dueDate, done);
  const text = dueDate ? formatDue(dueDate) : <span className="ticket-empty">—</span>;
  if (!editable) return <span className={`ticket-due ${tone}`}>{text}</span>;
  return (
    <span className={`ticket-due ticket-due-edit ${tone}`}>
      <button
        type="button"
        className="ticket-cell-button"
        aria-label={dueDate ? `Due ${formatDue(dueDate)}. Change due date` : 'Set due date'}
        onClick={(event) => {
          event.stopPropagation();
          const input = inputRef.current;
          if (!input) return;
          if (typeof input.showPicker === 'function') input.showPicker();
          else input.focus();
        }}
      >
        {text}
      </button>
      {dueDate ? (
        <button
          type="button"
          className="ticket-due-clear"
          aria-label="Clear due date"
          onClick={(event) => {
            event.stopPropagation();
            onChange(null);
          }}
        >
          ×
        </button>
      ) : null}
      <input
        ref={inputRef}
        type="date"
        className="ticket-due-input"
        tabIndex={-1}
        aria-hidden="true"
        value={dueDate ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
      />
    </span>
  );
}
