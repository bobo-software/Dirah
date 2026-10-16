import { useCallback, useEffect, useState } from 'react';
import { getTicket, type TicketActivity, type TicketComment } from '../../../api/tickets';
import { useAuthStore } from '../../../stores/StoresIndex';

type Detail = { ticketId: string; comments: TicketComment[]; activity: TicketActivity[] };

/**
 * Comments and history for one ticket. Refetches whenever `updatedAt` moves,
 * which happens on every save, so history picks up the change just made.
 */
export function useTicketDetail(ticketId: string, updatedAt: string) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    getTicket(accessToken, ticketId).then(
      (data) => !cancelled && setDetail({ ticketId, comments: data.comments, activity: data.activity }),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load updates')
    );
    return () => {
      cancelled = true;
    };
  }, [accessToken, ticketId, updatedAt]);

  const updateComments = useCallback(
    (update: (comments: TicketComment[]) => TicketComment[]) =>
      setDetail((current) => (current && current.ticketId === ticketId ? { ...current, comments: update(current.comments) } : current)),
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
