import { create } from 'zustand';
import { getMarkdown, putMarkdown } from '../../api/pages';
import { useAuthStore } from './authStore';
import { usePageStore } from './pageStore';

type ContentEntry = { content: string; hash: string; updatedAt: string };

type MarkdownContentState = {
  byPageId: Record<string, ContentEntry | undefined>;
  loadingIds: Set<string>;
  errorByPageId: Record<string, string | undefined>;
  loadContent: (pageId: string) => Promise<ContentEntry>;
  saveContent: (pageId: string, content: string, hash?: string) => Promise<ContentEntry>;
  clearContent: (pageId: string) => void;
};

function token(): string {
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) throw new Error('Not signed in');
  return accessToken;
}

export const useMarkdownContentStore = create<MarkdownContentState>((set) => ({
  byPageId: {},
  loadingIds: new Set(),
  errorByPageId: {},

  loadContent: async (pageId) => {
    set((state) => ({ loadingIds: new Set(state.loadingIds).add(pageId) }));
    try {
      const body = await getMarkdown(token(), pageId);
      const entry: ContentEntry = { content: body.content, hash: body.hash, updatedAt: body.updatedAt };
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
    const body = await putMarkdown(token(), pageId, content, hash);
    const entry: ContentEntry = { content: body.content, hash: body.hash, updatedAt: body.updatedAt };
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
}));
