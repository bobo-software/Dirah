import { API_URL, ApiError, apiRequest, refreshAccessToken } from './client';

export const ASSET_ROLES = [
  'character',
  'style',
  'location',
  'prop',
  'motion',
  'audio',
  'storyboard',
  'generated',
  'other',
] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

/** Largest upload the API accepts by default (MEDIA_MAX_BYTES). The server has the final say. */
export const MAX_ASSET_BYTES = 500 * 1024 * 1024;

/** File types the media library accepts; the API checks the bytes too. */
export const ASSET_ACCEPT = 'image/*,video/*,audio/*,.heic,.mkv,.glb,.fbx,.obj,.blend';

export type SignedLink = { url: string; expiresAt: string };

export type AssetGeneration = {
  model?: string;
  prompt?: string;
  sourceAssetIds?: string[];
  params?: Record<string, unknown>;
};

export type MediaAsset = {
  id: string;
  workspaceId: string;
  title: string;
  slug: string | null;
  parentId: string | null;
  mediaType: 'image' | 'video' | 'audio' | 'model';
  mime: string;
  ext: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  fps: number | null;
  hasAudio: boolean | null;
  vertexCount: number | null;
  triangleCount: number | null;
  /** Model size in metres. */
  bbox: { x: number; y: number; z: number } | null;
  modelInfo: { objects?: number; rigged?: boolean; animations?: string[]; materials?: number } | null;
  role: AssetRole;
  tags: string[];
  description: string;
  promptHint: string;
  sourceUrl: string | null;
  license: string | null;
  originalName: string | null;
  generation: AssetGeneration | null;
  status: 'processing' | 'ready' | 'failed';
  error: string | null;
  blobId: string;
  thumbnailBlobId: string | null;
  previewBlobId: string | null;
  createdAt: string;
  updatedAt: string;
  links: { url: SignedLink; thumbnailUrl: SignedLink | null; previewUrl: SignedLink | null };
};

export type AssetPatch = Partial<
  Pick<MediaAsset, 'title' | 'description' | 'tags' | 'role' | 'promptHint' | 'sourceUrl' | 'license'>
>;

export async function getAsset(accessToken: string, assetId: string): Promise<MediaAsset> {
  const data = await apiRequest<{ asset: MediaAsset }>(`/api/assets/${assetId}`, { accessToken });
  return data.asset;
}

export async function patchAsset(accessToken: string, assetId: string, patch: AssetPatch): Promise<MediaAsset> {
  const data = await apiRequest<{ asset: MediaAsset }>(`/api/assets/${assetId}`, {
    method: 'PATCH',
    accessToken,
    body: JSON.stringify(patch),
  });
  return data.asset;
}

export async function reprocessAsset(accessToken: string, assetId: string): Promise<MediaAsset> {
  const data = await apiRequest<{ asset: MediaAsset }>(`/api/assets/${assetId}/reprocess`, {
    method: 'POST',
    accessToken,
    body: JSON.stringify({}),
  });
  return data.asset;
}

export async function searchAssets(
  accessToken: string,
  workspaceId: string,
  filters: { q?: string; parentId?: string | 'root'; mediaType?: string; role?: string; tags?: string[]; limit?: number } = {}
): Promise<{ assets: MediaAsset[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.parentId) params.set('parentId', filters.parentId);
  if (filters.mediaType) params.set('mediaType', filters.mediaType);
  if (filters.role) params.set('role', filters.role);
  if (filters.tags?.length) params.set('tags', filters.tags.join(','));
  if (filters.limit) params.set('limit', String(filters.limit));
  const query = params.toString();
  return apiRequest(`/api/workspaces/${workspaceId}/assets${query ? `?${query}` : ''}`, { accessToken });
}

function sendUpload(
  accessToken: string,
  workspaceId: string,
  file: File,
  parentId: string | null,
  onProgress?: (fraction: number) => void
): Promise<{ status: number; body: { success?: boolean; message?: string; error?: string; data?: { asset: MediaAsset } } }> {
  const params = new URLSearchParams({ filename: file.name });
  if (parentId) params.set('parentId', parentId);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/workspaces/${workspaceId}/assets?${params.toString()}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body;
      try {
        body = JSON.parse(xhr.responseText || '{}');
      } catch {
        body = { message: xhr.statusText };
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new ApiError('Upload failed: network error', 0));
    xhr.send(file);
  });
}

/** Streams one media file into the workspace tree under `parentId`, reporting upload progress (0–1). */
export async function uploadAsset(
  accessToken: string,
  workspaceId: string,
  file: File,
  parentId: string | null,
  onProgress?: (fraction: number) => void
): Promise<MediaAsset> {
  if (file.size > MAX_ASSET_BYTES) {
    throw new ApiError(`${file.name} is larger than ${MAX_ASSET_BYTES / (1024 * 1024)} MB`, 413);
  }
  let res = await sendUpload(accessToken, workspaceId, file, parentId, onProgress);
  if (res.status === 401) {
    res = await sendUpload(await refreshAccessToken(), workspaceId, file, parentId, onProgress);
  }
  if (!res.body.success || !res.body.data) {
    throw new ApiError(res.body.message ?? 'Upload failed', res.status, res.body.error);
  }
  return res.body.data.asset;
}

export function formatDuration(ms: number | null): string {
  if (!ms) return '';
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
