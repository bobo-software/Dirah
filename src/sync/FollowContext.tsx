import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';

type FollowState = {
  followingId: number | null;
  follow: (clientId: number | null) => void;
};

const FollowContext = createContext<FollowState | null>(null);

export function FollowProvider({ children }: { children: ReactNode }) {
  const { pageId } = useParams();
  const [followingId, setFollowingId] = useState<number | null>(null);

  useEffect(() => {
    setFollowingId(null);
  }, [pageId]);

  const value = useMemo(
    () => ({ followingId, follow: setFollowingId }),
    [followingId]
  );
  return <FollowContext.Provider value={value}>{children}</FollowContext.Provider>;
}

export function useFollow(): FollowState {
  const ctx = useContext(FollowContext);
  if (!ctx) throw new Error('useFollow must be used within FollowProvider');
  return ctx;
}
