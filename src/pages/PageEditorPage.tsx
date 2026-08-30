import { useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PageEditorHost, type PageEditorHandle } from '../editor/PageEditorHost';
import { parseEditorView, readStoredView, storeView, type EditorView } from '../editor/viewMode';
import { canEdit, type WorkspaceOutlet } from './workspaceContext';
import { EditorViewToggle } from './EditorViewToggle';
import { AskPanel } from './AskPanel';
import { HistoryPanel } from './HistoryPanel';
import { deletePagePersistence } from '../editor';

export function PageEditorPage() {
  const { workspaceId, pageId } = useParams();
  const { role, pageTitle, accessToken, encrypted } = useOutletContext<WorkspaceOutlet>();
  const [searchParams, setSearchParams] = useSearchParams();
  const editorRef = useRef<PageEditorHandle>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editorGen, setEditorGen] = useState(0);
  const [editorHeld, setEditorHeld] = useState(false);
  const [seedIfEmpty, setSeedIfEmpty] = useState(true);

  useEffect(() => {
    setEditorGen(0);
    setEditorHeld(false);
    setSeedIfEmpty(true);
  }, [pageId]);

  const initialView = useMemo(() => {
    if (!workspaceId || !pageId) return 'page' as EditorView;
    const fromUrl = searchParams.get('view');
    if (fromUrl === 'edgeless' || fromUrl === 'page') {
      return parseEditorView(fromUrl);
    }
    return readStoredView(workspaceId, pageId);
  }, [workspaceId, pageId, searchParams]);

  const [view, setView] = useState<EditorView>(initialView);

  useEffect(() => {
    setView(initialView);
    editorRef.current?.setMode(initialView);
  }, [initialView]);

  function onViewChange(next: EditorView) {
    if (!workspaceId || !pageId) return;
    setView(next);
    storeView(workspaceId, pageId, next);
    editorRef.current?.setMode(next);
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'edgeless') {
      nextParams.set('view', 'edgeless');
    } else {
      nextParams.delete('view');
    }
    setSearchParams(nextParams, { replace: true });
  }

  const editable = canEdit(role);

  function onInsertDatabase(viewType: 'table' | 'kanban') {
    if (!editorRef.current?.insertDatabase(viewType)) {
      setMessage('Could not insert a database. Try again after the editor loads.');
      return;
    }
    setMessage(null);
    if (view !== 'page') {
      onViewChange('page');
    }
  }

  function onExport() {
    const markdown = editorRef.current?.exportMarkdown(pageTitle) ?? '';
    if (!markdown.trim()) {
      setMessage('The editor is still loading, or this page is empty.');
      return;
    }
    setMessage(null);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stem = (pageTitle || 'Untitled').replace(/[\\/:*?"<>|]+/g, '-');
    link.href = url;
    link.download = `${stem}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!workspaceId || !pageId) {
    return <p className="muted">Missing page.</p>;
  }

  return (
    <>
      <div className="editor-toolbar">
        <EditorViewToggle view={view} onChange={onViewChange} />
        {editable ? (
          <>
            <button type="button" className="linkish" onClick={() => onInsertDatabase('table')}>
              Table
            </button>
            <button type="button" className="linkish" onClick={() => onInsertDatabase('kanban')}>
              Kanban
            </button>
          </>
        ) : null}
        <button type="button" className="linkish" onClick={onExport}>
          Export markdown
        </button>
        {accessToken && !encrypted ? (
          <button
            type="button"
            className={`linkish${historyOpen ? ' on' : ''}`}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            History
          </button>
        ) : null}
        {accessToken && !encrypted ? (
          <button
            type="button"
            className={`linkish${askOpen ? ' on' : ''}`}
            onClick={() => setAskOpen((open) => !open)}
          >
            Ask
          </button>
        ) : null}
        {message ? (
          <p className="error" role="alert">
            {message}
          </p>
        ) : null}
      </div>
      {historyOpen && accessToken && !encrypted ? (
        <HistoryPanel
          pageId={pageId}
          accessToken={accessToken}
          editable={editable}
          onBeforeRestore={async () => {
            setEditorHeld(true);
            await new Promise((resolve) => setTimeout(resolve, 50));
          }}
          onRestored={async () => {
            await deletePagePersistence(workspaceId, pageId);
            setSeedIfEmpty(false);
            setEditorHeld(false);
            setEditorGen((n) => n + 1);
          }}
        />
      ) : null}
      {askOpen && accessToken && !encrypted ? (
        <AskPanel
          pageId={pageId}
          accessToken={accessToken}
          editable={editable}
          getContext={() => editorRef.current?.getAskContext(pageTitle) ?? ''}
          onInsert={(text) => editorRef.current?.insertText(text) ?? false}
        />
      ) : null}
      <PageEditorHost
        ref={editorRef}
        workspaceId={workspaceId}
        pageId={pageId}
        readonly={!editable}
        initialMode={initialView}
        onModeChange={(mode) => {
          if (mode !== view) onViewChange(mode);
        }}
        remountKey={editorGen + (encrypted ? 1 : 0)}
        heldOff={editorHeld}
        seedIfEmpty={seedIfEmpty}
      />
    </>
  );
}
