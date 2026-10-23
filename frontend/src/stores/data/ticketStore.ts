import { create } from 'zustand';
import {
  createTicket,
  createTicketBoard,
  createTicketGroup,
  createTicketStatus,
  deleteTicket,
  deleteTicketBoard,
  deleteTicketGroup,
  deleteTicketStatus,
  getTicketBoard,
  listTicketBoards,
  moveTicket,
  orderTicketGroups,
  orderTicketStatuses,
  patchTicket,
  patchTicketBoard,
  patchTicketGroup,
  patchTicketStatus,
  type BoardPatch,
  type GroupInput,
  type StatusInput,
  type Ticket,
  type TicketBoard,
  type TicketBoardView,
  type TicketMove,
  type TicketPatch,
} from '../../api/tickets';
import { useAuthStore } from './authStore';

// Stable reference for "no boards yet" selectors; see EMPTY_PAGES in pageStore.
export const EMPTY_TICKET_BOARDS: TicketBoard[] = [];

type TicketState = {
  byWorkspace: Record<string, TicketBoard[]>;
  loadedWorkspaces: Set<string>;
  views: Record<string, TicketBoardView>;
  fetchBoards: (workspaceId: string) => Promise<TicketBoard[]>;
  createBoard: (workspaceId: string, input: { name?: string; key?: string }) => Promise<TicketBoardView>;
  fetchBoard: (boardId: string) => Promise<TicketBoardView>;
  /**
   * Background refetch for polling. Skipped while a local write or drag is in
   * flight, and dropped if one started meanwhile, so it never undoes an
   * optimistic update.
   */
  refreshBoard: (boardId: string) => Promise<void>;
  /** The board views call this on drag start and end. */
  setDragging: (boardId: string, dragging: boolean) => void;
  patchBoard: (boardId: string, input: BoardPatch) => Promise<TicketBoard>;
  deleteBoard: (boardId: string) => Promise<void>;
  createTicket: (boardId: string, input: TicketPatch & { title: string }) => Promise<Ticket>;
  patchTicket: (boardId: string, ticketId: string, input: TicketPatch) => Promise<Ticket>;
  moveTicket: (boardId: string, ticketId: string, move: TicketMove) => Promise<void>;
  deleteTicket: (boardId: string, ticketId: string) => Promise<void>;
  /** Puts a ticket fetched elsewhere (e.g. the detail panel) back into its board view. */
  rememberTicket: (ticket: Ticket) => void;
  createStatus: (boardId: string, input: StatusInput & { name: string }) => Promise<void>;
  patchStatus: (boardId: string, statusId: string, input: StatusInput) => Promise<void>;
  deleteStatus: (boardId: string, statusId: string, moveTo?: string) => Promise<void>;
  orderStatuses: (boardId: string, ids: string[]) => Promise<void>;
  createGroup: (boardId: string, input: GroupInput & { name: string }) => Promise<void>;
  patchGroup: (boardId: string, groupId: string, input: GroupInput) => Promise<void>;
  deleteGroup: (boardId: string, groupId: string, moveTo?: string) => Promise<void>;
  orderGroups: (boardId: string, ids: string[]) => Promise<void>;
  reset: () => void;
};

function token(): string {
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) throw new Error('Not signed in');
  return accessToken;
}

function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((entry) => entry.id === item.id);
  if (index === -1) return [...items, item];
  const next = items.slice();
  next[index] = item;
  return next;
}

/** Keeps the board's ticket counts in step with its tickets after a local change. */
function withCounts(view: TicketBoardView): TicketBoardView {
  const done = new Set(view.statuses.filter((status) => status.category === 'done').map((status) => status.id));
  return {
    ...view,
    board: {
      ...view.board,
      ticketCount: view.tickets.length,
      openCount: view.tickets.filter((ticket) => !done.has(ticket.statusId)).length,
    },
  };
}

/**
 * Applies a drag locally so the UI moves before the server answers. Mirrors
 * TicketService.moveTicket: remove from the old list, insert at `index`, renumber.
 */
export function applyTicketMove(view: TicketBoardView, ticketId: string, move: TicketMove): TicketBoardView {
  let tickets = view.tickets.map((ticket) => ({ ...ticket }));
  const moving = tickets.find((ticket) => ticket.id === ticketId);
  if (!moving) return view;

  function place(
    container: (ticket: Ticket) => string,
    setContainer: (ticket: Ticket, id: string) => void,
    position: (ticket: Ticket) => number,
    setPosition: (ticket: Ticket, value: number) => void,
    target: string,
    index: number | undefined
  ) {
    const from = container(moving!);
    const byPosition = (a: Ticket, b: Ticket) => position(a) - position(b);
    const source = tickets.filter((ticket) => container(ticket) === from && ticket.id !== ticketId).sort(byPosition);
    const destination =
      from === target ? source : tickets.filter((ticket) => container(ticket) === target).sort(byPosition);
    const at = Math.max(0, Math.min(index ?? destination.length, destination.length));
    destination.splice(at, 0, moving!);
    setContainer(moving!, target);
    for (const list of from === target ? [destination] : [source, destination]) {
      list.forEach((ticket, i) => setPosition(ticket, i));
    }
  }

  if (move.groupId !== undefined || move.position !== undefined) {
    place(
      (ticket) => ticket.groupId,
      (ticket, id) => (ticket.groupId = id),
      (ticket) => ticket.position,
      (ticket, value) => (ticket.position = value),
      move.groupId ?? moving.groupId,
      move.position
    );
  }
  if (move.statusId !== undefined || move.statusPosition !== undefined) {
    place(
      (ticket) => ticket.statusId,
      (ticket, id) => (ticket.statusId = id),
      (ticket) => ticket.statusPosition,
      (ticket, value) => (ticket.statusPosition = value),
      move.statusId ?? moving.statusId,
      move.statusPosition
    );
  }
  tickets = tickets.slice();
  return withCounts({ ...view, tickets });
}

// Local writes and drags per board, for refreshBoard. Not state: nothing renders from them.
const inFlight = new Map<string, number>();
const dragging = new Set<string>();
const localEdits = new Map<string, number>();

function quiet(boardId: string): boolean {
  return !inFlight.get(boardId) && !dragging.has(boardId);
}

function touch(boardId: string) {
  localEdits.set(boardId, (localEdits.get(boardId) ?? 0) + 1);
}

async function tracked<T>(boardId: string, run: () => Promise<T>): Promise<T> {
  touch(boardId);
  inFlight.set(boardId, (inFlight.get(boardId) ?? 0) + 1);
  try {
    return await run();
  } finally {
    inFlight.set(boardId, (inFlight.get(boardId) ?? 1) - 1);
  }
}

export const useTicketStore = create<TicketState>((set, get) => {
  /** Stores a board view and keeps the workspace summary in step with it. */
  function putView(view: TicketBoardView) {
    set((state) => {
      const boards = state.byWorkspace[view.board.workspaceId];
      return {
        views: { ...state.views, [view.board.id]: view },
        byWorkspace: boards
          ? { ...state.byWorkspace, [view.board.workspaceId]: upsert(boards, view.board) }
          : state.byWorkspace,
      };
    });
  }

  function updateView(boardId: string, update: (view: TicketBoardView) => TicketBoardView): TicketBoardView | undefined {
    const view = get().views[boardId];
    if (!view) return undefined;
    putView(withCounts(update(view)));
    return view;
  }

  function putTicket(boardId: string, ticket: Ticket) {
    updateView(boardId, (view) => ({ ...view, tickets: upsert(view.tickets, ticket) }));
  }

  return {
    byWorkspace: {},
    loadedWorkspaces: new Set(),
    views: {},

    fetchBoards: async (workspaceId) => {
      const boards = await listTicketBoards(token(), workspaceId);
      set((state) => ({
        byWorkspace: { ...state.byWorkspace, [workspaceId]: boards },
        loadedWorkspaces: new Set(state.loadedWorkspaces).add(workspaceId),
      }));
      return boards;
    },

    createBoard: async (workspaceId, input) => {
      const view = await createTicketBoard(token(), workspaceId, input);
      set((state) => ({
        byWorkspace: {
          ...state.byWorkspace,
          [workspaceId]: upsert(state.byWorkspace[workspaceId] ?? [], view.board),
        },
        views: { ...state.views, [view.board.id]: view },
      }));
      return view;
    },

    fetchBoard: async (boardId) => {
      const view = await getTicketBoard(token(), boardId);
      putView(view);
      return view;
    },

    refreshBoard: async (boardId) => {
      if (!quiet(boardId)) return;
      const edits = localEdits.get(boardId) ?? 0;
      const view = await getTicketBoard(token(), boardId);
      if (!quiet(boardId) || (localEdits.get(boardId) ?? 0) !== edits) return;
      putView(view);
    },

    setDragging: (boardId, on) => {
      if (on) {
        touch(boardId);
        dragging.add(boardId);
      } else {
        dragging.delete(boardId);
      }
    },

    patchBoard: async (boardId, input) => {
      const board = await patchTicketBoard(token(), boardId, input);
      const view = get().views[boardId];
      if (view) {
        // A key change renames every ticket key, so refetch rather than patch locally.
        if (input.key !== undefined && input.key !== view.board.key) await get().fetchBoard(boardId);
        else putView({ ...view, board });
      } else {
        set((state) => ({
          byWorkspace: {
            ...state.byWorkspace,
            [board.workspaceId]: upsert(state.byWorkspace[board.workspaceId] ?? [], board),
          },
        }));
      }
      return board;
    },

    deleteBoard: async (boardId) => {
      await deleteTicketBoard(token(), boardId);
      set((state) => {
        const views = { ...state.views };
        delete views[boardId];
        const byWorkspace: Record<string, TicketBoard[]> = {};
        for (const [workspaceId, boards] of Object.entries(state.byWorkspace)) {
          byWorkspace[workspaceId] = boards.filter((board) => board.id !== boardId);
        }
        return { views, byWorkspace };
      });
    },

    createTicket: (boardId, input) =>
      tracked(boardId, async () => {
        const ticket = await createTicket(token(), boardId, input);
        putTicket(boardId, ticket);
        return ticket;
      }),

    // Optimistic: cell edits should feel instant; the server copy replaces the guess.
    patchTicket: (boardId, ticketId, input) =>
      tracked(boardId, async () => {
        const previous = get().views[boardId]?.tickets.find((ticket) => ticket.id === ticketId);
        if (previous) putTicket(boardId, { ...previous, ...input });
        try {
          const saved = await patchTicket(token(), ticketId, input);
          putTicket(boardId, saved);
          return saved;
        } catch (error) {
          if (previous) putTicket(boardId, previous);
          throw error;
        }
      }),

    moveTicket: (boardId, ticketId, move) =>
      tracked(boardId, async () => {
        const previous = updateView(boardId, (view) => applyTicketMove(view, ticketId, move));
        try {
          putView(await moveTicket(token(), ticketId, move));
        } catch (error) {
          if (previous) putView(previous);
          throw error;
        }
      }),

    deleteTicket: (boardId, ticketId) =>
      tracked(boardId, async () => {
        await deleteTicket(token(), ticketId);
        updateView(boardId, (view) => ({ ...view, tickets: view.tickets.filter((ticket) => ticket.id !== ticketId) }));
      }),

    rememberTicket: (ticket) => putTicket(ticket.boardId, ticket),

    createStatus: (boardId, input) =>
      tracked(boardId, async () => {
        const status = await createTicketStatus(token(), boardId, input);
        updateView(boardId, (view) => ({ ...view, statuses: upsert(view.statuses, status) }));
      }),

    patchStatus: (boardId, statusId, input) =>
      tracked(boardId, async () => {
        const status = await patchTicketStatus(token(), statusId, input);
        updateView(boardId, (view) => ({ ...view, statuses: upsert(view.statuses, status) }));
      }),

    deleteStatus: (boardId, statusId, moveTo) =>
      tracked(boardId, async () => {
        putView(await deleteTicketStatus(token(), statusId, moveTo));
      }),

    orderStatuses: (boardId, ids) =>
      tracked(boardId, async () => {
        const statuses = await orderTicketStatuses(token(), boardId, ids);
        updateView(boardId, (view) => ({ ...view, statuses }));
      }),

    createGroup: (boardId, input) =>
      tracked(boardId, async () => {
        const group = await createTicketGroup(token(), boardId, input);
        updateView(boardId, (view) => ({ ...view, groups: upsert(view.groups, group) }));
      }),

    patchGroup: (boardId, groupId, input) =>
      tracked(boardId, async () => {
        const group = await patchTicketGroup(token(), groupId, input);
        updateView(boardId, (view) => ({ ...view, groups: upsert(view.groups, group) }));
      }),

    deleteGroup: (boardId, groupId, moveTo) =>
      tracked(boardId, async () => {
        putView(await deleteTicketGroup(token(), groupId, moveTo));
      }),

    orderGroups: (boardId, ids) =>
      tracked(boardId, async () => {
        const groups = await orderTicketGroups(token(), boardId, ids);
        updateView(boardId, (view) => ({ ...view, groups }));
      }),

    reset: () => set({ byWorkspace: {}, loadedWorkspaces: new Set(), views: {} }),
  };
});
