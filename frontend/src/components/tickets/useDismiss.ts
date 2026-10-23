import { useEffect, useLayoutEffect } from 'react';
import { placeFloatingMenu } from '../notes/table/placeFloatingMenu';

/** Closes a floating menu on outside pointer-down or Escape, like the typed-table menus. */
export function useDismiss(menuRef: React.RefObject<HTMLElement | null>, anchor: HTMLElement, onClose: () => void) {
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
