import { create } from 'zustand';
import { previewInvite, type InvitePreview } from '../../api/members';

type InviteState = {
  previews: Record<string, InvitePreview>;
  loading: boolean;
  fetchPreview: (token: string) => Promise<InvitePreview>;
};

export const useInviteStore = create<InviteState>((set) => ({
  previews: {},
  loading: false,

  fetchPreview: async (token) => {
    set({ loading: true });
    try {
      const preview = await previewInvite(token);
      set((state) => ({ previews: { ...state.previews, [token]: preview }, loading: false }));
      return preview;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
}));
