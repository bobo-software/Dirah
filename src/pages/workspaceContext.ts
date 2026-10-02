import type { PageKind } from '../api/client';

export type WorkspaceOutlet = {
  role: string;
  pageTitle?: string;
  workspaceId: string;
  onCreateNode: (kind: PageKind, parentId?: string | null) => void;
};

export function canEdit(role: string): boolean {
  return role === 'owner' || role === 'editor';
}

export function canAdmin(role: string): boolean {
  return role === 'owner';
}

export type WorkspaceSection = 'notes' | 'docs' | 'tasks';

// Notes own the workspace root and /n/*, Tasks owns /tasks*; everything else (pages, collection, trash, settings) is Docs.
export function workspaceSection(pathname: string): WorkspaceSection {
  if (/^\/w\/[^/]+\/tasks(\/|$)/.test(pathname)) return 'tasks';
  return /^\/w\/[^/]+\/?$/.test(pathname) || /^\/w\/[^/]+\/n\//.test(pathname) ? 'notes' : 'docs';
}
