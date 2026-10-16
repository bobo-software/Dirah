import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { placeFloatingMenu } from '../notes/table/placeFloatingMenu';

const EMOJI = [
  '👍', '👎', '👏', '🙌', '🙏', '💪', '👀', '🤔',
  '😀', '😂', '😅', '😊', '😍', '😎', '😬', '😢',
  '🎉', '🚀', '✅', '❌', '⚠️', '🔥', '💡', '🐛',
  '📌', '📎', '📝', '📅', '⏳', '🔒', '❤️', '⭐',
];

/** A small floating grid of common emoji, anchored to the button that opened it. */
export function EmojiPicker({
  anchor,
  onPick,
  onClose,
}: {
  anchor: HTMLElement;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (menuRef.current) placeFloatingMenu(menuRef.current, anchor);
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
  }, [anchor, onClose]);

  return createPortal(
    <div ref={menuRef} className="note-col-menu emoji-menu" role="dialog" aria-label="Insert emoji">
      {EMOJI.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="emoji-menu-item"
          aria-label={`Insert ${emoji}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(emoji)}
        >
          {emoji}
        </button>
      ))}
    </div>,
    document.body
  );
}
