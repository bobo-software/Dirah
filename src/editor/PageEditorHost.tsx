import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { mountPageEditor, type DatabaseViewType, type MountedPageEditor } from '../editor';
import type { EditorView } from '../editor/viewMode';
import { useFollow } from '../sync/FollowContext';
import { useSync } from '../sync/SyncProvider';
import { workspaceDocKey } from '../crypto/vault';

export type PageEditorHandle = {
  exportMarkdown: (fallbackTitle?: string) => string;
  getAskContext: (fallbackTitle?: string) => string;
  setMode: (mode: EditorView) => void;
  insertDatabase: (viewType: DatabaseViewType) => boolean;
  insertText: (text: string) => boolean;
};

export const PageEditorHost = forwardRef<
  PageEditorHandle,
  {
    workspaceId: string;
    pageId: string;
    readonly?: boolean;
    initialMode?: EditorView;
    onModeChange?: (mode: EditorView) => void;
    remountKey?: number;
    heldOff?: boolean;
    seedIfEmpty?: boolean;
  }
>(function PageEditorHost(
  {
    workspaceId,
    pageId,
    readonly = false,
    initialMode = 'page',
    onModeChange,
    remountKey = 0,
    heldOff = false,
    seedIfEmpty = true,
  },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<MountedPageEditor | null>(null);
  const { accessToken, user } = useAuth();
  const { client } = useSync();
  const { followingId, follow } = useFollow();
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;
  const modeRef = useRef(initialMode);
  modeRef.current = initialMode;
  const onModeChangeRef = useRef(onModeChange);
  onModeChangeRef.current = onModeChange;
  const [sessionGen, setSessionGen] = useState(0);

  useImperativeHandle(ref, () => ({
    exportMarkdown(fallbackTitle?: string) {
      return sessionRef.current?.exportMarkdown(fallbackTitle) ?? '';
    },
    getAskContext(fallbackTitle?: string) {
      return sessionRef.current?.getAskContext(fallbackTitle) ?? '';
    },
    setMode(mode: EditorView) {
      sessionRef.current?.setMode(mode);
    },
    insertDatabase(viewType: DatabaseViewType) {
      return sessionRef.current?.insertDatabase(viewType) ?? false;
    },
    insertText(text: string) {
      return sessionRef.current?.insertText(text) ?? false;
    },
  }));

  useEffect(() => {
    const host = hostRef.current;
    if (!host || heldOff) return;
    let cancelled = false;
    let session: MountedPageEditor | undefined;

    void (async () => {
      try {
        const docKey = accessToken ? await workspaceDocKey(accessToken, workspaceId) : null;
        if (cancelled || !hostRef.current) return;
        const mounted = await mountPageEditor(hostRef.current, {
          workspaceId,
          pageId,
          getToken: () => tokenRef.current,
          sync: client,
          readonly,
          seedIfEmpty,
          mode: modeRef.current,
          displayName: user?.email ?? 'Anonymous',
          docKey,
        });
        if (cancelled) {
          await mounted.destroy();
          return;
        }
        session = mounted;
        sessionRef.current = mounted;
        setSessionGen((n) => n + 1);
      } catch (error: unknown) {
        if (!cancelled && host.isConnected) {
          host.replaceChildren();
          const message = document.createElement('p');
          message.className = 'error';
          message.textContent = error instanceof Error ? error.message : 'Could not open editor';
          host.append(message);
        }
      }
    })();

    return () => {
      cancelled = true;
      sessionRef.current = null;
      void session?.destroy();
      host.replaceChildren();
    };
  }, [workspaceId, pageId, client, readonly, user?.email, remountKey, heldOff, seedIfEmpty, accessToken]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || followingId == null) return;
    return session.follow(followingId, {
      onMode: (mode) => onModeChangeRef.current?.(mode),
      onStop: () => follow(null),
    });
  }, [followingId, sessionGen, follow]);

  return <div className="editor-host" ref={hostRef} />;
});
