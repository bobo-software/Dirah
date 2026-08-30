import type { PublicPage } from '../api/client';

export type WorkspaceOutlet = {
  role: string;
  accessToken: string | null;
  pageTitle?: string;
  refreshPages: () => Promise<void>;
  pages: PublicPage[];
  encrypted: boolean;
};

export function canEdit(role: string): boolean {
  return role === 'owner' || role === 'editor';
}

export function canAdmin(role: string): boolean {
  return role === 'owner';
}
