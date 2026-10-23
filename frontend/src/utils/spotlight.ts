import type { PointerEvent } from 'react';

/* Tracks the pointer inside an element as --spot-x / --spot-y so CSS can
   paint a spotlight that follows it (see .has-spotlight in index.css). */
export function trackSpotlight(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== 'mouse') return;
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
  el.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
}
