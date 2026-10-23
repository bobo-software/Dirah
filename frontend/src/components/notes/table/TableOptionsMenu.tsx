import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { placeFloatingMenu } from './placeFloatingMenu';
import { Button } from '../../buttons/Button';

export type TableMenuAction = {
  id: string
  label: string
  danger?: boolean
  run: () => void
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  'row-above': (
    <Icon>
      <path d="M4 5h16" />
      <path d="M12 19V9" />
      <path d="M8 13l4-4 4 4" />
    </Icon>
  ),
  'row-below': (
    <Icon>
      <path d="M4 19h16" />
      <path d="M12 5v10" />
      <path d="M8 11l4 4 4-4" />
    </Icon>
  ),
  'column-left': (
    <Icon>
      <path d="M5 4v16" />
      <path d="M19 12H9" />
      <path d="M13 8l-4 4 4 4" />
    </Icon>
  ),
  'column-right': (
    <Icon>
      <path d="M19 4v16" />
      <path d="M5 12h10" />
      <path d="M11 8l4 4-4 4" />
    </Icon>
  ),
  'delete-row': (
    <Icon>
      <path d="M4 7h16" />
      <path d="M7 12h10" />
      <path d="M4 17h16" />
    </Icon>
  ),
  'delete-column': (
    <Icon>
      <path d="M7 4v16" />
      <path d="M12 7v10" />
      <path d="M17 4v16" />
    </Icon>
  ),
  'delete-table': (
    <Icon>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 12h8l1-12" />
    </Icon>
  ),
};

export function TableOptionsMenu({
  anchor,
  actions,
  onClose,
}: {
  anchor: HTMLElement
  actions: TableMenuAction[]
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (menu) placeFloatingMenu(menu, anchor)
  })

  useEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const onPointerDown = (event: Event) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menu.contains(target) || anchor.contains(target)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  return (
    <div ref={menuRef} className="note-col-menu note-table-menu" role="menu" aria-label="Table options">
      {actions.map((action) => (
        <Button variant="plain"
          key={action.id}
          type="button"
          className={action.danger ? 'note-col-option danger' : 'note-col-option'}
          role="menuitem"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => action.run()}
        >
          {ICONS[action.id]}
          {action.label}
        </Button>
      ))}
    </div>
  )
}
