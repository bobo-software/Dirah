import type { PublicMember } from '../../api/members';
import type { Ticket, TicketActivity, TicketPriority } from '../../api/tickets';

/** How often an open board, ticket drawer and the Tickets home refetch. */
export const TICKET_POLL_MS = 15_000;

export const PRIORITY_META: Record<TicketPriority, { label: string; color: string }> = {
  none: { label: 'No priority', color: 'gray' },
  low: { label: 'Low', color: 'teal' },
  medium: { label: 'Medium', color: 'yellow' },
  high: { label: 'High', color: 'orange' },
  urgent: { label: 'Urgent', color: 'red' },
};

export const STATUS_CATEGORY_LABEL = { todo: 'Not started', doing: 'In progress', done: 'Done' } as const;

export function memberLabel(member: Pick<PublicMember, 'name' | 'email'> | undefined): string {
  if (!member) return 'Former member';
  return member.name?.trim() || member.email;
}

export function initials(member: Pick<PublicMember, 'name' | 'email'> | undefined): string {
  const label = memberLabel(member);
  const parts = label.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[1][0] : '')).toUpperCase();
}

/** Today as YYYY-MM-DD in the viewer's time zone, to compare with due dates. */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function formatDue(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(year, month - 1, day);
  const sameYear = year === new Date().getFullYear();
  return value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
}

export function dueTone(date: string | null, done: boolean): 'overdue' | 'today' | '' {
  if (!date || done) return '';
  const today = todayIso();
  if (date < today) return 'overdue';
  return date === today ? 'today' : '';
}

export function timeAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return format.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return format.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return format.format(-days, 'day');
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function text(value: unknown, empty = 'none'): string {
  return typeof value === 'string' && value ? value : empty;
}

/** One line of plain English for an activity entry, without the actor. */
export function describeActivity(entry: TicketActivity, memberName: (id: string) => string): string {
  const { data } = entry;
  switch (entry.type) {
    case 'created':
      return 'created this ticket';
    case 'status':
      return `moved it from ${text(data.from)} to ${text(data.to)}`;
    case 'group':
      return `moved it from group ${text(data.from)} to ${text(data.to)}`;
    case 'priority':
      return `set priority to ${PRIORITY_META[data.to as TicketPriority]?.label ?? text(data.to)}`;
    case 'due':
      return data.to ? `set the due date to ${formatDue(String(data.to))}` : 'cleared the due date';
    case 'title':
      return `renamed it to “${text(data.to, '')}”`;
    case 'assignees': {
      const added = Array.isArray(data.added) ? (data.added as string[]).map(memberName) : [];
      const removed = Array.isArray(data.removed) ? (data.removed as string[]).map(memberName) : [];
      const parts = [
        added.length ? `assigned ${added.join(', ')}` : '',
        removed.length ? `unassigned ${removed.join(', ')}` : '',
      ].filter(Boolean);
      return parts.join(' and ') || 'changed assignees';
    }
    default:
      return 'updated this ticket';
  }
}

export const DUE_FILTERS = ['overdue', 'today', 'week', 'none'] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];

export const DUE_FILTER_LABEL: Record<DueFilter, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  week: 'Due in 7 days',
  none: 'No due date',
};

/** Stands in for "no assignee" in an assignee filter. */
export const UNASSIGNED = 'none';

/** Each list narrows the board when non-empty; values inside one list are OR'd. */
export type TicketFilters = {
  text: string;
  statusIds: string[];
  priorities: TicketPriority[];
  assigneeIds: string[];
  groupIds: string[];
  due: DueFilter[];
};

export const NO_FILTERS: TicketFilters = { text: '', statusIds: [], priorities: [], assigneeIds: [], groupIds: [], due: [] };

export function isFiltering(filters: TicketFilters): boolean {
  return (
    filters.text.trim().length > 0 ||
    filters.statusIds.length > 0 ||
    filters.priorities.length > 0 ||
    filters.assigneeIds.length > 0 ||
    filters.groupIds.length > 0 ||
    filters.due.length > 0
  );
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const value = new Date(year, month - 1, day + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function matchesDue(ticket: Ticket, due: DueFilter, done: boolean, today: string): boolean {
  const date = ticket.dueDate;
  if (due === 'none') return !date;
  if (!date || done) return false;
  if (due === 'overdue') return date < today;
  if (due === 'today') return date === today;
  return date >= today && date <= addDays(today, 7);
}

/** `doneIds` are the board's done statuses: done tickets are never overdue or due soon. */
export function matchesFilter(ticket: Ticket, filters: TicketFilters, doneIds: Set<string>): boolean {
  const needle = filters.text.trim().toLowerCase();
  if (
    needle &&
    !ticket.title.toLowerCase().includes(needle) &&
    !ticket.key.toLowerCase().includes(needle) &&
    !ticket.labels.some((label) => label.toLowerCase().includes(needle))
  ) {
    return false;
  }
  if (filters.statusIds.length && !filters.statusIds.includes(ticket.statusId)) return false;
  if (filters.groupIds.length && !filters.groupIds.includes(ticket.groupId)) return false;
  if (filters.priorities.length && !filters.priorities.includes(ticket.priority)) return false;
  if (filters.assigneeIds.length) {
    const assigned = filters.assigneeIds.some((id) =>
      id === UNASSIGNED ? ticket.assigneeIds.length === 0 : ticket.assigneeIds.includes(id)
    );
    if (!assigned) return false;
  }
  if (filters.due.length) {
    const done = doneIds.has(ticket.statusId);
    const today = todayIso();
    if (!filters.due.some((due) => matchesDue(ticket, due, done, today))) return false;
  }
  return true;
}

export const BOARD_KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;

/** Mirrors the backend's suggestBoardKey so the field previews what the server would pick. */
export function suggestKey(name: string): string {
  const words = name.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  let key = words.length > 1 ? words.map((word) => word[0]).join('') : (words[0] ?? '');
  key = key.replace(/^[0-9]+/, '').slice(0, 6);
  if (key.length < 2) key = (key + 'TICKETS').slice(0, 4);
  return key;
}

/** A ticket's creation date: "14 Oct", or "14 Oct 2025" outside the current year. */
export function formatCreated(iso: string): string {
  const value = new Date(iso);
  const sameYear = value.getFullYear() === new Date().getFullYear();
  return value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
}
