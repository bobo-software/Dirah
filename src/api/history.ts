import { apiRequest } from './client';

export type PageSnapshot = {
  id: number;
  updateClock: number;
  createdAt: string;
  preview: string;
};

export async function listSnapshots(
  accessToken: string,
  pageId: string
): Promise<PageSnapshot[]> {
  const data = await apiRequest<{ snapshots: PageSnapshot[] }>(`/api/pages/${pageId}/snapshots`, {
    accessToken,
  });
  return data.snapshots;
}

export async function saveSnapshot(accessToken: string, pageId: string): Promise<PageSnapshot> {
  const data = await apiRequest<{ snapshot: PageSnapshot }>(`/api/pages/${pageId}/snapshots`, {
    method: 'POST',
    accessToken,
  });
  return data.snapshot;
}

export async function getSnapshot(
  accessToken: string,
  pageId: string,
  snapshotId: number
): Promise<PageSnapshot> {
  const data = await apiRequest<{ snapshot: PageSnapshot }>(
    `/api/pages/${pageId}/snapshots/${snapshotId}`,
    { accessToken }
  );
  return data.snapshot;
}

export async function restoreSnapshot(
  accessToken: string,
  pageId: string,
  snapshotId: number
): Promise<void> {
  await apiRequest(`/api/pages/${pageId}/snapshots/${snapshotId}/restore`, {
    method: 'POST',
    accessToken,
  });
}
