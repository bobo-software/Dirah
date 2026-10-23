import { create } from 'zustand';
import { getMarkdown, putMarkdown } from '../../api/pages';
import { isSealedMarkdown, openMarkdown, sealMarkdown, useEncryptionStore } from '../../crypto/workspaceCrypto';
import { useAuthStore } from './authStore';
import { usePageStore } from './pageStore';
import { useWorkspaceStore } from './workspaceStore';

type ContentEntry = { content: string; hash: string; updatedAt: string };

type MarkdownContentState = {
  byPageId: Record<string, ContentEntry | undefined>;
  loadingIds: Set<string>;
  errorByPageId: Record<string, string | undefined>;
  loadContent: (pageId: string) => Promise<ContentEntry>;
  saveContent: (pageId: string, content: string, hash?: string) => Promise<ContentEntry>;
  clearContent: (pageId: string) => void;
  clearAll: () => void;
};

function token(): string {
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) throw new Error('Not signed in');
  return accessToken;
}

function workspaceEncrypted(workspaceId: string): boolean {
  return useWorkspaceStore.getState().workspaces.some((workspace) => workspace.id === workspaceId && workspace.encrypted);
}

export const useMarkdownContentStore = create<MarkdownContentState>((set) => ({
  byPageId: {},
  loadingIds: new Set(),
  errorByPageId: {},

  loadContent: async (pageId) => {
    set((state) => ({ loadingIds: new Set(state.loadingIds).add(pageId) }));
    try {
      const accessToken = token();
      const body = await getMarkdown(accessToken, pageId);
      const encrypted = workspaceEncrypted(body.page.workspaceId);
      const content =
        encrypted && isSealedMarkdown(body.content)
          ? await openMarkdown(accessToken, body.page.workspaceId, body.content)
          : body.content;
      const entry: ContentEntry = { content, hash: body.hash, updatedAt: body.updatedAt };
      set((state) => {
        const loadingIds = new Set(state.loadingIds);
        loadingIds.delete(pageId);
        return {
          byPageId: { ...state.byPageId, [pageId]: entry },
          loadingIds,
          errorByPageId: { ...state.errorByPageId, [pageId]: undefined },
        };
      });
      return entry;
    } catch (error) {
      set((state) => {
        const loadingIds = new Set(state.loadingIds);
        loadingIds.delete(pageId);
        return {
          loadingIds,
          errorByPageId: {
            ...state.errorByPageId,
            [pageId]: error instanceof Error ? error.message : 'Could not load markdown',
          },
        };
      });
      throw error;
    }
  },

  saveContent: async (pageId, content, hash) => {
    const accessToken = token();
    const cached = usePageStore.getState();
    const workspaceId =
      Object.entries(cached.byWorkspace).find(([, pages]) => pages.some((page) => page.id === pageId))?.[0] ??
      useWorkspaceStore.getState().activeWorkspaceId ??
      undefined;
    if (workspaceId && useEncryptionStore.getState().lockingWorkspaceId === workspaceId) {
      throw new Error('Pages are being encrypted');
    }
    const payload =
      workspaceId && workspaceEncrypted(workspaceId)
        ? await sealMarkdown(accessToken, workspaceId, content)
        : content;
    const body = await putMarkdown(accessToken, pageId, payload, hash);
    const entry: ContentEntry = { content, hash: body.hash, updatedAt: body.updatedAt };
    set((state) => ({ byPageId: { ...state.byPageId, [pageId]: entry } }));
    usePageStore.getState().mergePage(body.page);
    return entry;
  },

  clearContent: (pageId) => {
    set((state) => {
      const next = { ...state.byPageId };
      delete next[pageId];
      return { byPageId: next };
    });
  },

  clearAll: () => set({ byPageId: {} }),
}));
