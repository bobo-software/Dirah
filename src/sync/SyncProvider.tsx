import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { SyncClient } from './SyncClient';
import { syncUrl, type SyncStatus } from './protocol';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4006';

type SyncContextValue = {
  client: SyncClient;
  status: SyncStatus;
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;
  const [status, setStatus] = useState<SyncStatus>('offline');

  const client = useMemo(
    () =>
      new SyncClient({
        url: syncUrl(API_URL),
        getToken: () => tokenRef.current,
      }),
    []
  );

  useEffect(() => client.onStatus(setStatus), [client]);

  useEffect(() => {
    if (accessToken) {
      client.start();
    } else {
      client.stop();
    }
    return () => client.stop();
  }, [accessToken, client]);

  const value = useMemo(() => ({ client, status }), [client, status]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
