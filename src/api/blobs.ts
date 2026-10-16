import { API_URL, apiRequest } from './client';

export const MAX_BLOB_BYTES = 12 * 1024 * 1024;

export type UploadedBlob = { id: string; mime: string; byteSize: number; url: string };

/** Stores a file in the workspace. The returned url (`/api/blobs/:id`) needs the bearer token to read. */
export async function uploadBlob(accessToken: string, workspaceId: string, file: File): Promise<UploadedBlob> {
  const data = await apiRequest<{ blob: UploadedBlob }>(`/api/workspaces/${workspaceId}/blobs`, {
    method: 'POST',
    accessToken,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  return data.blob;
}

/** Fetches a blob path such as `/api/blobs/:id` with the bearer token, for use as an object URL. */
export async function fetchBlob(accessToken: string, path: string): Promise<Blob> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Could not load the attachment');
  return res.blob();
}

export function isBlobPath(url: string | undefined): url is string {
  return typeof url === 'string' && /^\/api\/blobs\/[A-Za-z0-9._~+=-]{1,128}$/.test(url);
}
