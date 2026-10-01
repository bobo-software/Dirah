import { apiRequest } from './client';

export type PublicMember = {
  userId: string;
  email: string;
  name?: string | null;
  role: string;
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
