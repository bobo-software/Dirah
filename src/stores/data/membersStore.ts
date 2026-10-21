import { create } from 'zustand';
import {
  listMembers,
  inviteMember,
  revokeInvite,
  setMemberRole,
  setMemberHidden,
  setWorkspacesForMember,
  workspacesForMember,
  removeMember,
  type InviteResult,
  type MemberWorkspace,
  type PublicInvite,
  type PublicMember,
} from '../../api/members';
import { useAuthStore } from './authStore';

// Stable references — see the comment on EMPTY_PAGES in pageStore.ts.
export const EMPTY_MEMBERS: PublicMember[] = [];
export const EMPTY_INVITES: PublicInvite[] = [];

type MembersState = {
  byWorkspace: Record<string, { members: PublicMember[]; invites: PublicInvite[] }>;
  loading: boolean;
  error: string | null;
  fetchMembers: (workspaceId: string) => Promise<void>;
  inviteMember: (workspaceId: string, email: string, role: string) => Promise<InviteResult>;
  revokeInvite: (workspaceId: string, inviteId: string) => Promise<void>;
  setMemberRole: (workspaceId: string, userId: string, role: string) => Promise<void>;
  setMemberHidden: (workspaceId: string, userId: string, hidden: boolean) => Promise<void>;
  workspacesForMember: (userId: string) => Promise<MemberWorkspace[]>;
  setWorkspacesForMember: (
    userId: string,
    workspaces: { workspaceId: string; hidden: boolean }[]
  ) => Promise<MemberWorkspace[]>;
  removeMember: (workspaceId: string, userId: string) => Promise<void>;
};

function token(): string {
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) throw new Error('Not signed in');
  return accessToken;
}

export const useMembersStore = create<MembersState>((set, get) => ({
  byWorkspace: {},
  loading: false,
  error: null,

  fetchMembers: async (workspaceId) => {
    set({ loading: true, error: null });
    try {
      const data = await listMembers(token(), workspaceId);
      set((state) => ({ byWorkspace: { ...state.byWorkspace, [workspaceId]: data }, loading: false }));
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Could not load members' });
      throw error;
    }
  },

  inviteMember: async (workspaceId, email, role) => {
    const result = await inviteMember(token(), workspaceId, email, role);
    await get().fetchMembers(workspaceId);
    return result;
  },

  revokeInvite: async (workspaceId, inviteId) => {
    await revokeInvite(token(), workspaceId, inviteId);
    await get().fetchMembers(workspaceId);
  },

  setMemberRole: async (workspaceId, userId, role) => {
    await setMemberRole(token(), workspaceId, userId, role);
    await get().fetchMembers(workspaceId);
  },

  setMemberHidden: async (workspaceId, userId, hidden) => {
    await setMemberHidden(token(), workspaceId, userId, hidden);
    await get().fetchMembers(workspaceId);
  },

  workspacesForMember: (userId) => workspacesForMember(token(), userId),

  setWorkspacesForMember: async (userId, workspaces) => {
    const result = await setWorkspacesForMember(token(), userId, workspaces);
    const cached = workspaces.map((item) => item.workspaceId).filter((id) => get().byWorkspace[id]);
    await Promise.all(cached.map((id) => get().fetchMembers(id).catch(() => undefined)));
    return result;
  },

  removeMember: async (workspaceId, userId) => {
    await removeMember(token(), workspaceId, userId);
    await get().fetchMembers(workspaceId);
  },
}));
