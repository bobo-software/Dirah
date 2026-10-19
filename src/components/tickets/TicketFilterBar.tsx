import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PublicMember } from '../../api/members';
import { TICKET_PRIORITIES, type TicketBoardView } from '../../api/tickets';
import { MenuTrigger } from './TicketMenus';
import {
  DUE_FILTER_LABEL,
  DUE_FILTERS,
  isFiltering,
  matchesFilter,
  memberLabel,
  NO_FILTERS,
  PRIORITY_META,
  UNASSIGNED,
  type TicketFilters,
} from './ticketMeta';
import { useDismiss } from './useDismiss';
import { Button } from '../buttons/Button';

type FilterOption = { id: string; label: string; color?: string; count: number };

type ListFilter = Exclude<keyof TicketFilters, 'text'>;

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function FilterMenu({
  anchor,
  label,
  options,
  selected,
  onChange,
  onClose,
}: {
  anchor: HTMLElement;
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(menuRef, anchor, onClose);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  }

  return createPortal(
    <div ref={menuRef} className="note-col-menu ticket-menu ticket-filter-menu" role="dialog" aria-label={`Filter by ${label}`}>
      {options.map((option) => {
        const on = selected.includes(option.id);
        return (
          <label key={option.id} className={on ? 'ticket-menu-row on' : 'ticket-menu-row'}>
            <input type="checkbox" checked={on} onChange={() => toggle(option.id)} />
            {option.color ? (
              <span className={`ticket-pill note-type-${option.color}`}>{option.label}</span>
            ) : (
              <span className="ticket-member-name">{option.label}</span>
            )}
            <span className="ticket-filter-option-count">{option.count}</span>
          </label>
        );
      })}
      {selected.length ? (
        <Button variant="link" type="button" className="ticket-filter-menu-clear" onClick={() => onChange([])}>
          Clear
        </Button>
      ) : null}
    </div>,
    document.body
  );
}

function FilterChip({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const on = selected.length > 0;
  const summary =
    selected.length === 1 ? (options.find((option) => option.id === selected[0])?.label ?? '1') : `${selected.length}`;
  return (
    <MenuTrigger
      className={on ? 'ticket-filter-chip on' : 'ticket-filter-chip'}
      label={`Filter by ${label}`}
      menu={(anchor, close) => (
        <FilterMenu anchor={anchor} label={label} options={options} selected={selected} onChange={onChange} onClose={close} />
      )}
    >
      <span>{label}</span>
      {on ? <span className="ticket-filter-chip-value">{summary}</span> : null}
      <span className="ticket-filter-chip-caret" aria-hidden="true">
        ▾
      </span>
    </MenuTrigger>
  );
}

export function TicketFilterBar({
  view,
  members,
  filters,
  shown,
  onChange,
}: {
  view: TicketBoardView;
  members: PublicMember[];
  filters: TicketFilters;
  /** How many tickets pass the filters. */
  shown: number;
  onChange: (filters: TicketFilters) => void;
}) {
  // A shared link with ?q= opens straight into search.
  const [searching, setSearching] = useState(() => filters.text.length > 0);
  const set = <K extends keyof TicketFilters>(key: K, value: TicketFilters[K]) => onChange({ ...filters, [key]: value });
  const doneIds = new Set(view.statuses.filter((status) => status.category === 'done').map((status) => status.id));

  /** Tickets an option would show, given every other active filter. */
  function count(key: ListFilter, id: string): number {
    const narrowed = { ...filters, [key]: [id] };
    return view.tickets.filter((ticket) => matchesFilter(ticket, narrowed, doneIds)).length;
  }

  const options = (key: ListFilter, items: Omit<FilterOption, 'count'>[]): FilterOption[] =>
    items.map((item) => ({ ...item, count: count(key, item.id) }));

  const statuses = options(
    'statusIds',
    [...view.statuses]
      .sort((a, b) => a.position - b.position)
      .map((status) => ({ id: status.id, label: status.name, color: status.color }))
  );
  const groups = options(
    'groupIds',
    [...view.groups]
      .sort((a, b) => a.position - b.position)
      .map((group) => ({ id: group.id, label: group.name, color: group.color }))
  );
  const priorities = options(
    'priorities',
    [...TICKET_PRIORITIES].reverse().map((priority) => ({ id: priority, ...PRIORITY_META[priority] }))
  );
  const assignees = options('assigneeIds', [
    { id: UNASSIGNED, label: 'Unassigned' },
    ...members.map((member) => ({ id: member.userId, label: memberLabel(member) })),
  ]);
  const due = options(
    'due',
    DUE_FILTERS.map((value) => ({ id: value, label: DUE_FILTER_LABEL[value] }))
  );

  function closeSearch() {
    set('text', '');
    setSearching(false);
  }

  return (
    <div className="ticket-filter-bar" role="search">
      {searching ? (
        <div className="ticket-search">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search tickets"
            aria-label="Search tickets"
            value={filters.text}
            autoFocus
            onChange={(event) => set('text', event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeSearch();
            }}
          />
          <Button variant="plain" type="button" className="ticket-search-clear" aria-label="Clear search" onClick={closeSearch}>
            <CloseIcon />
          </Button>
        </div>
      ) : (
        <>
          <Button
            variant="plain"
            type="button"
            className="ticket-search-toggle"
            aria-label="Search tickets"
            title="Search"
            onClick={() => setSearching(true)}
          >
            <SearchIcon />
          </Button>
          <FilterChip label="Status" options={statuses} selected={filters.statusIds} onChange={(ids) => set('statusIds', ids)} />
          <FilterChip
            label="Priority"
            options={priorities}
            selected={filters.priorities}
            onChange={(ids) => set('priorities', ids as TicketFilters['priorities'])}
          />
          <FilterChip label="Assignee" options={assignees} selected={filters.assigneeIds} onChange={(ids) => set('assigneeIds', ids)} />
          <FilterChip label="Group" options={groups} selected={filters.groupIds} onChange={(ids) => set('groupIds', ids)} />
          <FilterChip label="Due" options={due} selected={filters.due} onChange={(ids) => set('due', ids as TicketFilters['due'])} />
        </>
      )}
      {isFiltering(filters) ? (
        <>
          <span className="muted ticket-filter-count">
            {shown} of {view.tickets.length}
          </span>
          {searching ? null : (
            <Button variant="link" type="button" onClick={() => onChange(NO_FILTERS)}>
              Clear filters
            </Button>
          )}
        </>
      ) : null}
    </div>
  );
}
