import { apiRequest, type PublicPage } from './client';

export type ListPagesQuery = {
  trashed?: boolean;
  q?: string;
};

export async function listPages(
  accessToken: string,
  workspaceId: string,
  query: ListPagesQuery = {}
): Promise<PublicPage[]> {
  const params = new URLSearchParams();
  if (query.trashed) params.set('trashed', '1');
  if (query.q) params.set('q', query.q);
  const suffix = params.size ? `?${params.toString()}` : '';
  const data = await apiRequest<{ pages: PublicPage[] }>(
    `/api/workspaces/${workspaceId}/pages${suffix}`,
    { accessToken }
  );
  return data.pages;
}

export async function createPage(
  accessToken: string,
  workspaceId: string,
  input: { id?: string; title?: string; parentId?: string | null } = {}
): Promise<PublicPage> {
  const data = await apiRequest<{ page: PublicPage }>(`/api/workspaces/${workspaceId}/pages`, {
    method: 'POST',
    accessToken,
    body: JSON.stringify(input),
  });
  return data.page;
}

export async function patchPage(
  accessToken: string,
  pageId: string,
  input: { title?: string; parentId?: string | null; position?: number; status?: string }
): Promise<PublicPage> {
  const data = await apiRequest<{ page: PublicPage }>(`/api/pages/${pageId}`, {
    method: 'PATCH',
    accessToken,
    body: JSON.stringify(input),
  });
  return data.page;
}

export async function deletePage(accessToken: string, pageId: string): Promise<void> {
  await apiRequest(`/api/pages/${pageId}`, {
    method: 'DELETE',
    accessToken,
  });
}

export async function restorePage(accessToken: string, pageId: string): Promise<PublicPage> {
  const data = await apiRequest<{ page: PublicPage }>(`/api/pages/${pageId}/restore`, {
    method: 'POST',
    accessToken,
  });
  return data.page;
}

export async function deletePagePermanent(accessToken: string, pageId: string): Promise<string[]> {
  const data = await apiRequest<{ ids: string[] }>(`/api/pages/${pageId}/permanent`, {
    method: 'DELETE',
    accessToken,
  });
  return data.ids;
}

export async function setPageFavorite(
  accessToken: string,
  pageId: string,
  favorite: boolean
): Promise<PublicPage> {
  const data = await apiRequest<{ page: PublicPage }>(`/api/pages/${pageId}/favorite`, {
    method: favorite ? 'PUT' : 'DELETE',
    accessToken,
  });
  return data.page;
}
