export const WORKSPACE_ROLES = ['owner', 'editor', 'viewer'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export const MEMBER_ROLES = ['editor', 'viewer'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export function isMemberRole(value: string): value is MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(value);
}

export function canEdit(role: string): boolean {
  return role === 'owner' || role === 'editor';
}

export function canAdminMembers(role: string): boolean {
  return role === 'owner';
}
