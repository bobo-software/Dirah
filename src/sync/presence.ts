const IDLE_MS = 45_000;
const HEARTBEAT_MS = 15_000;
const COLORS = ['#6950e6', '#2b7de9', '#c99212', '#c44436', '#1f9a78', '#c45bb0'];

type IdleAwareness = {
  clientID: number;
  setLocalStateField: (field: string, value: unknown) => void;
  getLocalState: () => Record<string, unknown> | null;
};

export function attachPresence(awareness: IdleAwareness, displayName: string): () => void {
  awareness.setLocalStateField('user', { name: displayName });
  awareness.setLocalStateField('color', COLORS[Math.abs(awareness.clientID) % COLORS.length]);
  setIdle(awareness, false);

  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const bump = () => {
    setIdle(awareness, false);
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => setIdle(awareness, true), IDLE_MS);
  };

  const onVisibility = () => {
    if (document.hidden) {
      setIdle(awareness, true);
      return;
    }
    bump();
  };

  const heartbeat = window.setInterval(() => {
    awareness.setLocalStateField('tick', Date.now());
  }, HEARTBEAT_MS);

  window.addEventListener('pointerdown', bump);
  window.addEventListener('keydown', bump);
  document.addEventListener('visibilitychange', onVisibility);
  bump();

  return () => {
    if (idleTimer) clearTimeout(idleTimer);
    window.clearInterval(heartbeat);
    window.removeEventListener('pointerdown', bump);
    window.removeEventListener('keydown', bump);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

function setIdle(awareness: IdleAwareness, idle: boolean): void {
  const current = awareness.getLocalState();
  if (Boolean(current?.idle) === idle) return;
  awareness.setLocalStateField('idle', idle);
}
