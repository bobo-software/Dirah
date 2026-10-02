import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { ColorDot } from './ColorDot';
import { type SelectColor, type SelectOption } from './columnTypes';
import { placeFloatingMenu } from './placeFloatingMenu';

export function SelectValueMenu({
  anchor,
  value,
  options,
  editable,
  onSelect,
  onClear,
  onCreate,
  onRecolor,
  onClose,
}: {
  anchor: HTMLElement;
  value: string;
  options: SelectOption[];
  editable: boolean;
  onSelect: (value: string) => void;
  onClear: () => void;
  onCreate: (name: string) => void;
  onRecolor: (name: string, color: SelectColor) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const current = value.trim();
  const known = options.some((option) => option.n === current);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (menu) placeFloatingMenu(menu, anchor);
  });

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const onPointerDown = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menu.contains(target) || anchor.contains(target)) return;
      if (target instanceof Element && target.closest('.note-color-palette')) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const name = draft.trim();
    if (!name || !editable) return;
    onCreate(name);
  }

  return (
    <div ref={menuRef} className="note-col-menu note-select-menu" role="menu">
      <div className="note-select-menu-head">
        <span className={current ? undefined : 'note-select-empty-label'}>{current || 'Empty'}</span>
        {editable && current ? (
          <button type="button" className="note-select-clear" aria-label="Clear" onClick={onClear}>
            ×
          </button>
        ) : null}
      </div>
      {options.map((option) => {
        const selected = option.n === current;
        return (
          <div key={option.n} className={selected ? 'note-type-row on' : 'note-type-row'} role="none">
            <ColorDot
              color={option.c}
              name={option.n}
              disabled={!editable}
              onChange={(color) => onRecolor(option.n, color)}
            />
            <button
              type="button"
              className="note-type-name"
              role="menuitemradio"
              aria-checked={selected}
              disabled={!editable}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(option.n)}
            >
              {option.n}
            </button>
          </div>
        );
      })}
      {current && !known ? (
        <button
          type="button"
          className="note-col-option on"
          role="menuitemradio"
          aria-checked
          disabled={!editable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(current)}
        >
          {current}
        </button>
      ) : null}
      {editable ? (
        <form className="note-type-create" onSubmit={onSubmit}>
          <input
            type="text"
            placeholder="New type"
            aria-label="New type"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit">Add</button>
        </form>
      ) : null}
    </div>
  );
}
