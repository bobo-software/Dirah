import type { PageKind, PublicPage } from '../api/client';

export type WorkspaceOutlet = {
  role: string;
  accessToken: string | null;
  pageTitle?: string;
  refreshPages: () => Promise<void>;
  pages: PublicPage[];
  encrypted: boolean;
  onCreateNode: (kind: PageKind, parentId?: string | null) => void;
};

export function canEdit(role: string): boolean {
  return role === 'owner' || role === 'editor';
}

export function canAdmin(role: string): boolean {
  return role === 'owner';
}
