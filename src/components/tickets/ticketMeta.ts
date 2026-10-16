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

export function matchesFilter(ticket: Ticket, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  if (!needle) return true;
  return (
    ticket.title.toLowerCase().includes(needle) ||
    ticket.key.toLowerCase().includes(needle) ||
    ticket.labels.some((label) => label.toLowerCase().includes(needle))
  );
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
