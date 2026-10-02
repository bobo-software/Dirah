const LAST_WORKSPACE_KEY = 'dira.lastWorkspaceId';

export function getLastWorkspaceId(): string | null {
  return localStorage.getItem(LAST_WORKSPACE_KEY);
}

export function setLastWorkspaceId(id: string): void {
  localStorage.setItem(LAST_WORKSPACE_KEY, id);
}

export function clearLastWorkspaceId(): void {
  localStorage.removeItem(LAST_WORKSPACE_KEY);
}

export function pickDefaultWorkspaceId(ids: string[]): string | null {
  if (ids.length === 0) return null;
  const last = getLastWorkspaceId();
  if (last && ids.includes(last)) return last;
  return ids[0] ?? null;
}
