import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { PublicMember } from '../../api/members';
import { placeFloatingMenu } from '../notes/table/placeFloatingMenu';
import { initials, memberLabel } from './ticketMeta';
import { Button } from '../buttons/Button';

/** Closes a floating menu on outside pointer-down or Escape, like the typed-table menus. */
function useDismiss(menuRef: React.RefObject<HTMLElement | null>, anchor: HTMLElement, onClose: () => void) {
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (menu) placeFloatingMenu(menu, anchor);
  });

  useEffect(() => {
    const onPointerDown = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [menuRef, anchor, onClose]);
}

export type MenuOption = { id: string; label: string; color: string };

export function OptionMenu({
  anchor,
  value,
  options,
  label,
  onSelect,
  onClose,
}: {
  anchor: HTMLElement;
  value: string;
  options: MenuOption[];
  label: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(menuRef, anchor, onClose);

  return createPortal(
    <div ref={menuRef} className="note-col-menu note-select-menu ticket-menu" role="menu" aria-label={label}>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <Button variant="plain"
            key={option.id}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            className={selected ? 'ticket-menu-row on' : 'ticket-menu-row'}
            onClick={() => {
              onSelect(option.id);
              onClose();
            }}
          >
            <span className={`ticket-pill note-type-${option.color}`}>{option.label}</span>
          </Button>
        );
      })}
    </div>,
    document.body
  );
}

export function Avatar({ member, size = 'sm' }: { member: PublicMember | undefined; size?: 'sm' | 'md' }) {
  return (
    <span className={`ticket-avatar ticket-avatar-${size}`} title={memberLabel(member)} aria-hidden="true">
      {initials(member)}
    </span>
  );
}

export function MemberPicker({
  anchor,
  members,
  selected,
  onChange,
  onClose,
}: {
  anchor: HTMLElement;
  members: PublicMember[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  useDismiss(menuRef, anchor, onClose);

  const needle = query.trim().toLowerCase();
  const visible = members.filter(
    (member) => !needle || member.email.toLowerCase().includes(needle) || member.name?.toLowerCase().includes(needle)
  );

  function toggle(userId: string) {
    onChange(selected.includes(userId) ? selected.filter((id) => id !== userId) : [...selected, userId]);
  }

  return createPortal(
    <div ref={menuRef} className="note-col-menu ticket-menu ticket-member-menu" role="dialog" aria-label="Assignees">
      <input
        type="search"
        className="ticket-menu-search"
        placeholder="Search people"
        aria-label="Search people"
        value={query}
        autoFocus
        onChange={(event) => setQuery(event.target.value)}
      />
      {visible.length === 0 ? <p className="muted ticket-menu-empty">No one matches.</p> : null}
      {visible.map((member) => {
        const on = selected.includes(member.userId);
        return (
          <label key={member.userId} className={on ? 'ticket-menu-row on' : 'ticket-menu-row'}>
            <input type="checkbox" checked={on} onChange={() => toggle(member.userId)} />
            <Avatar member={member} />
            <span className="ticket-member-name">
              {memberLabel(member)}
              {member.name ? <small>{member.email}</small> : null}
            </span>
          </label>
        );
      })}
    </div>,
    document.body
  );
}

/** A button that opens a floating menu anchored to itself. */
export function MenuTrigger({
  className,
  label,
  disabled,
  children,
  menu,
}: {
  className: string;
  label: string;
  disabled?: boolean;
  children: ReactNode;
  menu: (anchor: HTMLElement, close: () => void) => ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Button variant="plain"
        type="button"
        className={className}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(anchor ? null : event.currentTarget);
        }}
      >
        {children}
      </Button>
      {anchor ? menu(anchor, () => setAnchor(null)) : null}
    </>
  );
}
