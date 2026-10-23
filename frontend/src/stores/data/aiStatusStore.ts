import { create } from 'zustand';
import { getAiStatus } from '../../api/ai';
import { useAuthStore } from './authStore';

type AiStatusState = {
  enabled: boolean;
  loaded: boolean;
  fetchStatus: () => Promise<boolean>;
};

export const useAiStatusStore = create<AiStatusState>((set, get) => ({
  enabled: false,
  loaded: false,

  fetchStatus: async () => {
    if (get().loaded) return get().enabled;
    const accessToken = useAuthStore.getState().accessToken;
    if (!accessToken) return false;
    try {
      const enabled = await getAiStatus(accessToken);
      set({ enabled, loaded: true });
      return enabled;
    } catch {
      set({ enabled: false, loaded: true });
      return false;
    }
  },
}));
