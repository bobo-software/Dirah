import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { ColorDot } from './ColorDot';
import { COLUMN_TYPE_LABEL, COLUMN_TYPES, nextSelectColor, type ColumnType, type SelectOption } from './columnTypes';
import { placeFloatingMenu } from './placeFloatingMenu';
import { Button } from '../../buttons/Button';

const ICON_PATHS: Record<ColumnType, string> = {
  text: '<path d="M5 6h14M5 12h14M5 18h9"/>',
  number: '<path d="M8 5l-2 14M18 5l-2 14M5 9h15M4 15h15"/>',
  checkbox: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
  date: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3.5v3M16 3.5v3M4 10h16"/>',
  select: '<path d="M5 7h14M5 12h14M5 17h8"/><path d="M17 15l2 2 2-2"/>',
  url: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};

export function ColumnTypeIcon({ type }: { type: ColumnType }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[type] }}
    />
  );
}

export function ColumnTypeButton({
  type,
  colPos,
  onClick,
}: {
  type: ColumnType;
  colPos: number;
  onClick: (button: HTMLButtonElement) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <Button variant="plain"
      ref={buttonRef}
      type="button"
      className="note-col-type"
      aria-haspopup="menu"
      aria-expanded="false"
      data-col-pos={colPos}
      aria-label={`${COLUMN_TYPE_LABEL[type]} column. Change column type`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        const button = buttonRef.current;
        if (button) onClick(button);
      }}
    >
      <ColumnTypeIcon type={type} />
    </Button>
  );
}

function ChoiceEditor({
  options,
  editable,
  onOptionsChange,
}: {
  options: SelectOption[];
  editable: boolean;
  onOptionsChange: (options: SelectOption[]) => void;
}) {
  const [draft, setDraft] = useState('');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const label = draft.trim();
    if (!label || !editable || options.some((option) => option.n === label)) return;
    onOptionsChange([...options, { n: label, c: nextSelectColor(options) }]);
    setDraft('');
  }

  return (
    <div className="note-col-choices">
      <p>Choices</p>
      {options.length === 0 ? (
        <p className="note-col-choices-empty">No choices yet</p>
      ) : (
        <ul>
          {options.map((option) => (
            <li key={option.n}>
              <ColorDot
                color={option.c}
                name={option.n}
                disabled={!editable}
                onChange={(color) =>
                  onOptionsChange(
                    options.map((entry) => (entry.n === option.n ? { ...entry, c: color } : entry)),
                  )
                }
              />
              <span>{option.n}</span>
              {editable ? (
                <Button variant="plain"
                  type="button"
                  className="note-col-choice-remove"
                  aria-label={`Remove ${option.n}`}
                  onClick={() => onOptionsChange(options.filter((entry) => entry.n !== option.n))}
                >
                  ×
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {editable ? (
        <form className="note-col-choice-add" onSubmit={onSubmit}>
          <input
            type="text"
            placeholder="Add a choice"
            aria-label="Add a choice"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit">Add</Button>
        </form>
      ) : null}
    </div>
  );
}

export function ColumnTypeSelector({
  anchor,
  type,
  options,
  editable,
  onTypeChange,
  onOptionsChange,
  onClose,
}: {
  anchor: HTMLElement;
  type: ColumnType;
  options: SelectOption[];
  editable: boolean;
  onTypeChange: (type: ColumnType) => void;
  onOptionsChange: (options: SelectOption[]) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

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
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && menu.contains(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [anchor, onClose]);

  return (
    <div ref={menuRef} className="note-col-menu" role="menu" tabIndex={-1}>
      {COLUMN_TYPES.map((item) => (
        <Button variant="plain"
          key={item}
          type="button"
          className={item === type ? 'note-col-option on' : 'note-col-option'}
          role="menuitemradio"
          aria-checked={item === type}
          disabled={!editable}
          onClick={() => {
            if (!editable) return;
            onTypeChange(item);
          }}
        >
          <ColumnTypeIcon type={item} />
          {COLUMN_TYPE_LABEL[item]}
        </Button>
      ))}
      {type === 'select' ? (
        <ChoiceEditor options={options} editable={editable} onOptionsChange={onOptionsChange} />
      ) : null}
    </div>
  );
}
