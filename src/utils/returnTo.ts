const KEY = 'dirah.returnTo';

/** Only same-origin app paths; never `//host` or absolute URLs (open redirect). */
function isSafePath(path: string | null | undefined): path is string {
  return Boolean(path && path.startsWith('/') && !path.startsWith('//'));
}

/**
 * Remember where to land after sign-in. Location state covers password login; this
 * covers flows that leave the SPA (Google/GitHub sign-in, register → login hops).
 */
export function rememberReturnTo(path: string): void {
  if (!isSafePath(path)) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    // Storage blocked: password login still works through location state.
  }
}

/** The remembered path, if any. Pure, so it is safe to call during render. */
export function readReturnTo(): string | null {
  try {
    const path = sessionStorage.getItem(KEY);
    return isSafePath(path) ? path : null;
  } catch {
    return null;
  }
}

/** Forget the remembered path once the user is inside the app. */
export function clearReturnTo(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
