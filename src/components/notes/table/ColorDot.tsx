import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SELECT_COLORS, type SelectColor } from './columnTypes';
import { placeFloatingMenu } from './placeFloatingMenu';
import { Button } from '../../buttons/Button';

function colorLabel(color: SelectColor) {
  return color.charAt(0).toUpperCase() + color.slice(1);
}

export function ColorDot({
  color,
  name,
  disabled,
  onChange,
}: {
  color: SelectColor;
  name: string;
  disabled?: boolean;
  onChange: (color: SelectColor) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const palette = paletteRef.current;
      const button = buttonRef.current;
      if (palette && button) placeFloatingMenu(palette, button);
    };
    place();
    queueMicrotask(place);
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (paletteRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <>
      <Button variant="plain"
        ref={buttonRef}
        type="button"
        className={`note-type-dot note-type-${color}`}
        aria-label={`${colorLabel(color)} color for ${name}. Choose a color`}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (!disabled) setOpen((value) => !value);
        }}
      />
      {open
        ? createPortal(
            <div ref={paletteRef} className="note-color-palette" role="dialog" aria-label={`Color for ${name}`}>
              {SELECT_COLORS.map((item) => (
                <Button variant="plain"
                  key={item}
                  type="button"
                  className={`note-type-dot note-type-${item}`}
                  aria-label={colorLabel(item)}
                  aria-pressed={item === color}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                />
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
