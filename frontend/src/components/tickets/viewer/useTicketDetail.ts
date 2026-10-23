import { useCallback, useEffect, useRef, useState } from 'react';
import { getTicket, type TicketActivity, type TicketComment } from '../../../api/tickets';
import { useVisiblePoll } from '../../../hooks/useVisiblePoll';
import { useAuthStore } from '../../../stores/StoresIndex';
import { TICKET_POLL_MS } from '../ticketMeta';

type Detail = { ticketId: string; comments: TicketComment[]; activity: TicketActivity[] };

/**
 * Comments and history for one ticket. Refetches whenever `updatedAt` moves,
 * which happens on every save, so history picks up the change just made, and
 * on the board's poll interval so other people's comments show up.
 */
export function useTicketDetail(ticketId: string, updatedAt: string) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped by local comment edits so a fetch that started earlier cannot undo them.
  const localEdits = useRef(0);

  const load = useCallback(
    (isCancelled: () => boolean = () => false) => {
      const edits = localEdits.current;
      return getTicket(accessToken ?? '', ticketId).then(
        (data) => {
          if (isCancelled() || localEdits.current !== edits) return;
          setDetail({ ticketId, comments: data.comments, activity: data.activity });
          setError(null);
        },
        (err: unknown) => !isCancelled() && setError(err instanceof Error ? err.message : 'Could not load updates')
      );
    },
    [accessToken, ticketId]
  );

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [accessToken, load, updatedAt]);

  useVisiblePoll(() => load(), TICKET_POLL_MS, Boolean(accessToken));

  const updateComments = useCallback(
    (update: (comments: TicketComment[]) => TicketComment[]) => {
      localEdits.current += 1;
      setDetail((current) => (current && current.ticketId === ticketId ? { ...current, comments: update(current.comments) } : current));
    },
    [ticketId]
  );

  const loaded = detail?.ticketId === ticketId;
  return {
    loaded,
    error,
    comments: loaded ? detail.comments : [],
    activity: loaded ? detail.activity : [],
    updateComments,
  };
}
