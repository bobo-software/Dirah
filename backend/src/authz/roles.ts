export const WORKSPACE_ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export const MEMBER_ROLES = ['admin', 'editor', 'viewer'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export function isMemberRole(value: string): value is MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(value);
}

export function canEdit(role: string): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

/** Invite, revoke invites, change non-owner roles, remove non-owners, moderate comments. */
export function canAdminMembers(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

/** Delete or encrypt the workspace, MCP tokens, public share links, owner roles. */
export function isOwner(role: string): boolean {
  return role === 'owner';
}
