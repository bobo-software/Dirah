import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type EditorViewState = {
  showSource: boolean;
  toggleShowSource: () => void;
  setShowSource: (value: boolean) => void;
};

export const useEditorViewStore = create<EditorViewState>()(
  persist(
    (set) => ({
      showSource: false,
      toggleShowSource: () => set((state) => ({ showSource: !state.showSource })),
      setShowSource: (value) => set({ showSource: value }),
    }),
    {
      name: 'dirah.editorShowSource',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
