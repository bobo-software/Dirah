import { apiRequest } from './client';

export type PublicShareLink = {
  token: string;
  pageId: string;
  workspaceId: string;
  permission: string;
};

export type PublicSharedPage = {
  page: { id: string; title: string; workspaceId: string };
  permission: string;
};

export async function getShare(accessToken: string, pageId: string): Promise<PublicShareLink | null> {
  const data = await apiRequest<{ share: PublicShareLink | null }>(`/api/pages/${pageId}/share`, {
    accessToken,
  });
  return data.share;
}

export async function createShare(accessToken: string, pageId: string): Promise<PublicShareLink> {
  const data = await apiRequest<{ share: PublicShareLink }>(`/api/pages/${pageId}/share`, {
    method: 'POST',
    accessToken,
    body: JSON.stringify({ permission: 'view' }),
  });
  return data.share;
}

export async function revokeShare(accessToken: string, pageId: string): Promise<void> {
  await apiRequest(`/api/pages/${pageId}/share`, {
    method: 'DELETE',
    accessToken,
  });
}

export async function getPublicPage(token: string): Promise<PublicSharedPage> {
  return apiRequest<PublicSharedPage>(`/api/public/pages/${encodeURIComponent(token)}`);
}
