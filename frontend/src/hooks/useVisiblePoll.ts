import { useEffect, useRef } from 'react';

/**
 * Calls `poll` every `intervalMs` while the tab is visible, and once right
 * away when the tab becomes visible again. Errors are swallowed: a missed
 * poll is retried on the next tick.
 */
export function useVisiblePoll(poll: () => Promise<unknown> | void, intervalMs: number, enabled = true) {
  const latest = useRef(poll);
  useEffect(() => {
    latest.current = poll;
  });

  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      if (document.visibilityState !== 'visible') return;
      void Promise.resolve()
        .then(() => latest.current())
        .catch(() => undefined);
    };
    const timer = window.setInterval(run, intervalMs);
    document.addEventListener('visibilitychange', run);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', run);
    };
  }, [intervalMs, enabled]);
}
