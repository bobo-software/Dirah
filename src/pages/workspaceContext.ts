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
