import { create } from 'zustand';
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  patchNote,
  putNoteContent,
  type NoteBody,
  type NotePatch,
} from '../../api/notes';
import type { NoteKind, NoteVisibility, PublicNote } from '../../api/client';
import { useAuthStore } from './authStore';

// Stable reference for "no notes yet" selectors; see EMPTY_PAGES in pageStore.
export const EMPTY_NOTES: PublicNote[] = [];

type NoteState = {
  byWorkspace: Record<string, PublicNote[]>;
  loadedWorkspaces: Set<string>;
  loading: boolean;
  error: string | null;
  fetchNotes: (workspaceId: string) => Promise<PublicNote[]>;
  createNote: (
    workspaceId: string,
    input?: { title?: string; parentId?: string | null; visibility?: NoteVisibility; kind?: NoteKind }
  ) => Promise<PublicNote>;
  patchNote: (noteId: string, input: NotePatch) => Promise<PublicNote>;
  trashNote: (noteId: string) => Promise<void>;
  loadContent: (noteId: string) => Promise<NoteBody>;
  saveContent: (noteId: string, content: string, hash?: string) => Promise<NoteBody>;
  mergeNote: (note: PublicNote) => void;
  reset: () => void;
};

function token(): string {
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) throw new Error('Not signed in');
  return accessToken;
}

function upsert(list: PublicNote[], note: PublicNote): PublicNote[] {
  const index = list.findIndex((item) => item.id === note.id);
  if (index === -1) return [...list, note];
  const next = list.slice();
  next[index] = note;
  return next;
}

/** Ids of `rootId` and everything nested under it. */
export function noteSubtreeIds(notes: PublicNote[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const note of notes) {
      if (note.parentId && ids.has(note.parentId) && !ids.has(note.id)) {
        ids.add(note.id);
        grew = true;
      }
    }
  }
  return ids;
}

export const useNoteStore = create<NoteState>((set, get) => ({
  byWorkspace: {},
  loadedWorkspaces: new Set(),
  loading: false,
  error: null,

  fetchNotes: async (workspaceId) => {
    set({ loading: true, error: null });
    try {
      const notes = await listNotes(token(), workspaceId);
      set((state) => ({
        byWorkspace: { ...state.byWorkspace, [workspaceId]: notes },
        loadedWorkspaces: new Set(state.loadedWorkspaces).add(workspaceId),
        loading: false,
      }));
      return notes;
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Could not load notes' });
      throw error;
    }
  },

  createNote: async (workspaceId, input) => {
    const note = await createNote(token(), workspaceId, input);
    get().mergeNote(note);
    return note;
  },

  patchNote: async (noteId, input) => {
    const note = await patchNote(token(), noteId, input);
    get().mergeNote(note);
    // Visibility cascades to the subtree on the server; mirror it locally.
    if (input.visibility) {
      const list = get().byWorkspace[note.workspaceId] ?? [];
      const subtree = noteSubtreeIds(list, note.id);
      set((state) => ({
        byWorkspace: {
          ...state.byWorkspace,
          [note.workspaceId]: (state.byWorkspace[note.workspaceId] ?? []).map((item) =>
            subtree.has(item.id) ? { ...item, visibility: note.visibility } : item
          ),
        },
      }));
    }
    return note;
  },

  trashNote: async (noteId) => {
    await deleteNote(token(), noteId);
    set((state) => {
      const next: Record<string, PublicNote[]> = {};
      for (const [workspaceId, notes] of Object.entries(state.byWorkspace)) {
        const gone = notes.some((note) => note.id === noteId) ? noteSubtreeIds(notes, noteId) : null;
        next[workspaceId] = gone ? notes.filter((note) => !gone.has(note.id)) : notes;
      }
      return { byWorkspace: next };
    });
  },

  loadContent: async (noteId) => {
    const body = await getNote(token(), noteId);
    get().mergeNote(body.note);
    return body;
  },

  saveContent: async (noteId, content, hash) => {
    const body = await putNoteContent(token(), noteId, content, hash);
    get().mergeNote(body.note);
    return body;
  },

  mergeNote: (note) => {
    set((state) => ({
      byWorkspace: { ...state.byWorkspace, [note.workspaceId]: upsert(state.byWorkspace[note.workspaceId] ?? [], note) },
    }));
  },

  reset: () => set({ byWorkspace: {}, loadedWorkspaces: new Set(), loading: false, error: null }),
}));
