import { apiRequest } from './client';

export type PublicMember = {
  userId: string;
  email: string;
  name?: string | null;
  role: string;
  /** Still a member, but the workspace is out of their list and returns 403. */
  hidden: boolean;
};

export type MemberWorkspace = {
  workspaceId: string;
  name: string;
  role: string;
  hidden: boolean;
};

export type PublicInvite = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  inviteUrl: string;
  mailed?: boolean;
};

export type InvitePreview = {
  email: string;
  workspaceName: string;
  role: string;
  expiresAt: string;
  invitedByEmail: string;
  accountExists: boolean;
};

export type InviteResult = { invite: PublicInvite; member?: undefined };

export async function listMembers(
  accessToken: string,
  workspaceId: string
): Promise<{ members: PublicMember[]; invites: PublicInvite[] }> {
  return apiRequest<{ members: PublicMember[]; invites: PublicInvite[] }>(
    `/api/workspaces/${workspaceId}/members`,
    { accessToken }
  );
}

export async function inviteMember(
  accessToken: string,
  workspaceId: string,
  email: string,
  role: string
): Promise<InviteResult> {
  return apiRequest<InviteResult>(`/api/workspaces/${workspaceId}/members`, {
    method: 'POST',
    accessToken,
    body: JSON.stringify({ email, role }),
  });
}

export async function revokeInvite(
  accessToken: string,
  workspaceId: string,
  inviteId: string
): Promise<void> {
  await apiRequest(`/api/workspaces/${workspaceId}/invites/${inviteId}`, {
    method: 'DELETE',
    accessToken,
  });
}

export async function previewInvite(token: string): Promise<InvitePreview> {
  const data = await apiRequest<{ invite: InvitePreview }>(`/api/invites/${token}`);
  return data.invite;
}

export async function setMemberRole(
  accessToken: string,
  workspaceId: string,
  userId: string,
  role: string
): Promise<PublicMember> {
  const data = await apiRequest<{ member: PublicMember }>(
    `/api/workspaces/${workspaceId}/members/${userId}`,
    {
      method: 'PATCH',
      accessToken,
      body: JSON.stringify({ role }),
    }
  );
  return data.member;
}

export async function setMemberHidden(
  accessToken: string,
  workspaceId: string,
  userId: string,
  hidden: boolean
): Promise<PublicMember> {
  const data = await apiRequest<{ member: PublicMember }>(
    `/api/workspaces/${workspaceId}/members/${userId}`,
    {
      method: 'PATCH',
      accessToken,
      body: JSON.stringify({ hidden }),
    }
  );
  return data.member;
}

export async function workspacesForMember(accessToken: string, userId: string): Promise<MemberWorkspace[]> {
  const data = await apiRequest<{ workspaces: MemberWorkspace[] }>(`/api/members/${userId}/workspaces`, {
    accessToken,
  });
  return data.workspaces;
}

export async function setWorkspacesForMember(
  accessToken: string,
  userId: string,
  workspaces: { workspaceId: string; hidden: boolean }[]
): Promise<MemberWorkspace[]> {
  const data = await apiRequest<{ workspaces: MemberWorkspace[] }>(`/api/members/${userId}/workspaces`, {
    method: 'PUT',
    accessToken,
    body: JSON.stringify({ workspaces }),
  });
  return data.workspaces;
}

export async function removeMember(
  accessToken: string,
  workspaceId: string,
  userId: string
): Promise<void> {
  await apiRequest(`/api/workspaces/${workspaceId}/members/${userId}`, {
    method: 'DELETE',
    accessToken,
  });
}
