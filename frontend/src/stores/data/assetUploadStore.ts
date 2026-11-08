import { create } from 'zustand';
import { uploadAsset, type MediaAsset } from '../../api/assets';
import { useAuthStore } from './authStore';
import { usePageStore } from './pageStore';

export type AssetUpload = {
  key: string;
  workspaceId: string;
  name: string;
  progress: number;
  state: 'uploading' | 'done' | 'error';
  error?: string;
  assetId?: string;
};

type AssetUploadState = {
  uploads: AssetUpload[];
  /** Uploads files one after another into `parentId` (null for the root); resolves with the stored assets. */
  uploadFiles: (workspaceId: string, parentId: string | null, files: File[]) => Promise<MediaAsset[]>;
  dismiss: (key: string) => void;
  clearFinished: () => void;
};

let counter = 0;

export const useAssetUploadStore = create<AssetUploadState>((set, get) => ({
  uploads: [],

  uploadFiles: async (workspaceId, parentId, files) => {
    const entries = files.map((file) => ({ file, key: `upload-${Date.now()}-${(counter += 1)}` }));
    set((state) => ({
      uploads: [
        ...state.uploads,
        ...entries.map(({ file, key }) => ({ key, workspaceId, name: file.name, progress: 0, state: 'uploading' as const })),
      ],
    }));
    const update = (key: string, patch: Partial<AssetUpload>) =>
      set((state) => ({ uploads: state.uploads.map((item) => (item.key === key ? { ...item, ...patch } : item)) }));
    const stored: MediaAsset[] = [];
    for (const { file, key } of entries) {
      try {
        const token = useAuthStore.getState().accessToken;
        if (!token) throw new Error('Not signed in');
        const asset = await uploadAsset(token, workspaceId, file, parentId, (progress) => update(key, { progress }));
        stored.push(asset);
        update(key, { state: 'done', progress: 1, assetId: asset.id });
      } catch (error) {
        update(key, { state: 'error', error: error instanceof Error ? error.message : 'Upload failed' });
      }
    }
    if (stored.length) {
      await usePageStore.getState().fetchPages(workspaceId).catch(() => undefined);
    }
    // Finished rows fade out on their own; failures stay until dismissed.
    window.setTimeout(() => {
      const done = new Set(entries.map((entry) => entry.key));
      set((state) => ({ uploads: state.uploads.filter((item) => !(done.has(item.key) && item.state === 'done')) }));
    }, 4000);
    return stored;
  },

  dismiss: (key) => set((state) => ({ uploads: state.uploads.filter((item) => item.key !== key) })),
  clearFinished: () => set({ uploads: get().uploads.filter((item) => item.state === 'uploading') }),
}));
