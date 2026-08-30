import type { BlobSource } from '@blocksuite/sync';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4006';

export class HttpBlobSource implements BlobSource {
  readonly name = 'dira-http';
  readonly = false;

  private readonly options: {
    workspaceId: string;
    getToken: () => string | null;
    getShare?: () => string | null;
  };

  constructor(options: {
    workspaceId: string;
    getToken: () => string | null;
    getShare?: () => string | null;
    uploads?: boolean;
  }) {
    this.options = options;
    this.readonly = options.uploads === false;
  }

  async delete(key: string): Promise<void> {
    const token = this.options.getToken();
    if (!token) return;
    await fetch(`${API_URL}/api/blobs/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async get(key: string): Promise<Blob | null> {
    const share = this.options.getShare?.();
    if (share) {
      const res = await fetch(
        `${API_URL}/api/public/pages/${encodeURIComponent(share)}/blobs/${encodeURIComponent(key)}`
      );
      if (!res.ok) return null;
      return res.blob();
    }
    const token = this.options.getToken();
    if (!token) return null;
    const res = await fetch(`${API_URL}/api/blobs/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.blob();
  }

  async list(): Promise<string[]> {
    const token = this.options.getToken();
    if (!token) return [];
    const res = await fetch(`${API_URL}/api/workspaces/${this.options.workspaceId}/blobs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { success: boolean; data?: { blobs: string[] } };
    return body.data?.blobs ?? [];
  }

  async set(key: string, value: Blob): Promise<string> {
    const token = this.options.getToken();
    if (!token) return key;
    const res = await fetch(`${API_URL}/api/workspaces/${this.options.workspaceId}/blobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': value.type || 'application/octet-stream',
        'X-Dira-Blob-Id': key,
      },
      body: value,
    });
    const body = (await res.json()) as { success: boolean; message: string; data?: { blob: { id: string } } };
    if (!body.success || !body.data) {
      throw new Error(body.message);
    }
    return body.data.blob.id;
  }
}
