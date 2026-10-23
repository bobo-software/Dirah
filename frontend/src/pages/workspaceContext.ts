import type { PageKind } from '../api/client';

export type WorkspaceOutlet = {
  role: string;
  pageTitle?: string;
  workspaceId: string;
  onCreateNode: (kind: PageKind, parentId?: string | null) => void;
};

export function canEdit(role: string): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

/** Owner-only: rename, encrypt, delete. */
export function canAdmin(role: string): boolean {
  return role === 'owner';
}

export function canManageMembers(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

export type WorkspaceSection = 'notes' | 'docs' | 'tasks' | 'tickets';

// Notes own the workspace root and /n/*, Tasks owns /tasks*, Tickets owns /tickets*; everything else (pages, collection, trash, settings) is Docs.
export function workspaceSection(pathname: string): WorkspaceSection {
  if (/^\/w\/[^/]+\/tasks(\/|$)/.test(pathname)) return 'tasks';
  if (/^\/w\/[^/]+\/tickets(\/|$)/.test(pathname)) return 'tickets';
  return /^\/w\/[^/]+\/?$/.test(pathname) || /^\/w\/[^/]+\/n\//.test(pathname) ? 'notes' : 'docs';
}
