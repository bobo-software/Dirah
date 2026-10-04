import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { NoteGlyph } from '../NoteTree';
import type { NoteLinkItem } from './noteLinkItems';

export type NoteLinkPickerHandle = {
  /** Arrow keys and Enter drive the list; returns true when the key was used. */
  onKeyDown: (event: KeyboardEvent | React.KeyboardEvent) => boolean;
};

type Props = {
  items: NoteLinkItem[];
  onPick: (item: NoteLinkItem) => void;
  busy?: boolean;
  empty?: string;
};

export const NoteLinkPicker = forwardRef<NoteLinkPickerHandle, Props>(function NoteLinkPicker(
  { items, onPick, busy = false, empty = 'No matching notes' },
  ref
) {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const [lastItems, setLastItems] = useState(items);
  if (items !== lastItems) {
    setLastItems(items);
    setActive(0);
  }

  useEffect(() => {
    listRef.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (event) => {
        if (items.length === 0) return false;
        if (event.key === 'ArrowDown') {
          setActive((index) => (index + 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowUp') {
          setActive((index) => (index - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const item = items[Math.min(active, items.length - 1)];
          if (item && !busy) onPick(item);
          return true;
        }
        return false;
      },
    }),
    [items, active, busy, onPick]
  );

  return (
    <div className="note-link-picker" role="listbox" aria-label="Link to note" ref={listRef}>
      {items.length === 0 ? <p className="note-link-picker-empty">{empty}</p> : null}
      {items.map((item, index) => (
        <button
          key={item.kind === 'note' ? item.note.id : 'create'}
          type="button"
          role="option"
          aria-selected={index === active}
          className={`note-col-option note-link-option${index === active ? ' on' : ''}`}
          disabled={busy}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActive(index)}
          onClick={() => onPick(item)}
        >
          {item.kind === 'note' ? (
            <>
              <NoteGlyph note={item.note} />
              <span className="note-link-option-text">
                <span className="note-link-option-title">{item.note.title}</span>
                {item.trail ? <span className="note-link-option-trail">{item.trail}</span> : null}
              </span>
            </>
          ) : (
            <>
              <span className="note-glyph" aria-hidden="true">
                +
              </span>
              <span className="note-link-option-text">
                <span className="note-link-option-title">
                  {busy ? 'Creating…' : <>Create sub-note “{item.title}”</>}
                </span>
              </span>
            </>
          )}
        </button>
      ))}
    </div>
  );
});
