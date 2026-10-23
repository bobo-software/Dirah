import { create } from 'zustand';
import { listPages, createPage, patchPage, deletePage, restorePage, deletePagePermanent, setPageFavorite } from '../../api/pages';
import type { PageKind, PublicPage } from '../../api/client';
import { useAuthStore } from './authStore';

// Stable reference for "no pages yet" selectors. A fresh `[] ` literal in a
// selector fallback (e.g. `state.byWorkspace[id] ?? []`) allocates a new
// array every call, which useSyncExternalStore treats as a changed snapshot
// on every render and causes an infinite re-render loop.
export const EMPTY_PAGES: PublicPage[] = [];

type PageState = {
  byWorkspace: Record<string, PublicPage[]>;
  trashedByWorkspace: Record<string, PublicPage[]>;
  loadedWorkspaces: Set<string>;
  loading: boolean;
  error: string | null;
  fetchPages: (workspaceId: string, opts?: { q?: string }) => Promise<PublicPage[]>;
  fetchTrashed: (workspaceId: string) => Promise<PublicPage[]>;
  createPage: (
    workspaceId: string,
    input?: { id?: string; title?: string; parentId?: string | null; kind?: PageKind; slug?: string }
  ) => Promise<PublicPage>;
  patchPage: (
    pageId: string,
    input: { title?: string; parentId?: string | null; position?: number; status?: string }
  ) => Promise<PublicPage>;
  trashPage: (pageId: string) => Promise<void>;
  restorePage: (pageId: string) => Promise<PublicPage>;
  deletePagePermanent: (pageId: string) => Promise<string[]>;
  setFavorite: (pageId: string, favorite: boolean) => Promise<PublicPage>;
  mergePage: (page: PublicPage) => void;
  reset: () => void;
};

function token(): string {
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) throw new Error('Not signed in');
  return accessToken;
}

function upsert(list: PublicPage[], page: PublicPage): PublicPage[] {
  const index = list.findIndex((item) => item.id === page.id);
  if (index === -1) return [...list, page];
  const next = list.slice();
  next[index] = page;
  return next;
}

function findPage(state: PageState, pageId: string): { workspaceId: string; page: PublicPage } | null {
  for (const [workspaceId, pages] of Object.entries(state.byWorkspace)) {
    const page = pages.find((item) => item.id === pageId);
    if (page) return { workspaceId, page };
  }
  return null;
}

export const usePageStore = create<PageState>((set, get) => ({
  byWorkspace: {},
  trashedByWorkspace: {},
  loadedWorkspaces: new Set(),
  loading: false,
  error: null,

  fetchPages: async (workspaceId, opts) => {
    set({ loading: true, error: null });
    try {
      const pages = await listPages(token(), workspaceId, { q: opts?.q });
      set((state) => ({
        byWorkspace: { ...state.byWorkspace, [workspaceId]: pages },
        loadedWorkspaces: new Set(state.loadedWorkspaces).add(workspaceId),
        loading: false,
      }));
      return pages;
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Could not load pages' });
      throw error;
    }
  },

  fetchTrashed: async (workspaceId) => {
    const pages = await listPages(token(), workspaceId, { trashed: true });
    set((state) => ({ trashedByWorkspace: { ...state.trashedByWorkspace, [workspaceId]: pages } }));
    return pages;
  },

  createPage: async (workspaceId, input) => {
    const page = await createPage(token(), workspaceId, input);
    set((state) => ({
      byWorkspace: { ...state.byWorkspace, [workspaceId]: [...(state.byWorkspace[workspaceId] ?? []), page] },
    }));
    return page;
  },

  patchPage: async (pageId, input) => {
    const page = await patchPage(token(), pageId, input);
    get().mergePage(page);
    return page;
  },

  trashPage: async (pageId) => {
    const found = findPage(get(), pageId);
    await deletePage(token(), pageId);
    if (!found) return;
    set((state) => ({
      byWorkspace: {
        ...state.byWorkspace,
        [found.workspaceId]: (state.byWorkspace[found.workspaceId] ?? []).filter((item) => item.id !== pageId),
      },
      trashedByWorkspace: {
        ...state.trashedByWorkspace,
        [found.workspaceId]: [...(state.trashedByWorkspace[found.workspaceId] ?? []), found.page],
      },
    }));
  },

  restorePage: async (pageId) => {
    const page = await restorePage(token(), pageId);
    set((state) => ({
      trashedByWorkspace: {
        ...state.trashedByWorkspace,
        [page.workspaceId]: (state.trashedByWorkspace[page.workspaceId] ?? []).filter((item) => item.id !== pageId),
      },
      byWorkspace: {
        ...state.byWorkspace,
        [page.workspaceId]: upsert(state.byWorkspace[page.workspaceId] ?? [], page),
      },
    }));
    return page;
  },

  deletePagePermanent: async (pageId) => {
    const ids = await deletePagePermanent(token(), pageId);
    set((state) => {
      const next = { ...state.trashedByWorkspace };
      for (const workspaceId of Object.keys(next)) {
        next[workspaceId] = next[workspaceId].filter((item) => !ids.includes(item.id));
      }
      return { trashedByWorkspace: next };
    });
    return ids;
  },

  setFavorite: async (pageId, favorite) => {
    const page = await setPageFavorite(token(), pageId, favorite);
    get().mergePage(page);
    return page;
  },

  mergePage: (page) => {
    set((state) => ({
      byWorkspace: { ...state.byWorkspace, [page.workspaceId]: upsert(state.byWorkspace[page.workspaceId] ?? [], page) },
    }));
  },

  reset: () => set({ byWorkspace: {}, trashedByWorkspace: {}, loadedWorkspaces: new Set(), loading: false, error: null }),
}));
