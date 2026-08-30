import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getPublicPage } from '../api/share';
import { mountPageEditor, type MountedPageEditor } from '../editor';
import { parseEditorView, readStoredView, storeView, type EditorView } from '../editor/viewMode';
import { SyncClient } from '../sync/SyncClient';
import { syncUrl, type SyncStatus } from '../sync/protocol';
import { EditorViewToggle } from './EditorViewToggle';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4006';

export function PublicSharePage() {
  const { token } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<MountedPageEditor | null>(null);
  const [title, setTitle] = useState('Shared page');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncStatus>('offline');
  const tokenRef = useRef(token ?? null);
  tokenRef.current = token ?? null;

  const storageId = token ? `s:${token}` : '';
  const initialView = useMemo(() => {
    const fromUrl = searchParams.get('view');
    if (fromUrl === 'edgeless' || fromUrl === 'page') {
      return parseEditorView(fromUrl);
    }
    return storageId ? readStoredView('public', storageId) : 'page';
  }, [searchParams, storageId]);
  const [view, setView] = useState<EditorView>(initialView);
  const viewRef = useRef(view);
  viewRef.current = view;

  const client = useMemo(
    () =>
      new SyncClient({
        url: syncUrl(API_URL),
        getToken: () => null,
        getShare: () => tokenRef.current,
      }),
    []
  );

  useEffect(() => client.onStatus(setStatus), [client]);

  useEffect(() => {
    if (!token) return;
    client.start();
    return () => client.stop();
  }, [client, token]);

  useEffect(() => {
    setView(initialView);
    sessionRef.current?.setMode(initialView);
  }, [initialView]);

  function onViewChange(next: EditorView) {
    if (!storageId) return;
    setView(next);
    viewRef.current = next;
    storeView('public', storageId, next);
    sessionRef.current?.setMode(next);
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'edgeless') {
      nextParams.set('view', 'edgeless');
    } else {
      nextParams.delete('view');
    }
    setSearchParams(nextParams, { replace: true });
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !token) return;
    let cancelled = false;
    let session: MountedPageEditor | undefined;

    void (async () => {
      try {
        const data = await getPublicPage(token);
        if (cancelled) return;
        setTitle(data.page.title);
        const mounted = await mountPageEditor(host, {
          workspaceId: data.page.workspaceId,
          pageId: data.page.id,
          getToken: () => null,
          getShare: () => tokenRef.current,
          sync: client,
          readonly: true,
          seedIfEmpty: false,
          persistenceKey: `dira:s:${token}`,
          mode: viewRef.current,
          displayName: 'Guest',
        });
        if (cancelled) {
          await mounted.destroy();
          return;
        }
        session = mounted;
        sessionRef.current = mounted;
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'This link is not available');
        }
      }
    })();

    return () => {
      cancelled = true;
      sessionRef.current = null;
      void session?.destroy();
      host.replaceChildren();
    };
  }, [client, token]);

  if (!token) {
    return <p className="muted">Missing link.</p>;
  }

  return (
    <div className="public-share">
      <header className="topbar">
        <Link to="/" className="brand">
          Dira
        </Link>
        <span className="muted public-share-title">{title}</span>
        <span className={`sync-status ${status}`}>{status}</span>
        <span className="muted public-share-ro">Read only</span>
        <EditorViewToggle view={view} onChange={onViewChange} />
      </header>
      {error ? (
        <p className="error panel" role="alert">
          {error}
        </p>
      ) : (
        <div className="editor-host" ref={hostRef} />
      )}
    </div>
  );
}
