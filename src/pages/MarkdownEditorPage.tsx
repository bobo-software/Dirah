import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useOutletContext, useParams } from 'react-router-dom';
import { canEdit, type WorkspaceOutlet } from './workspaceContext';
import { pageKind } from './pageKind';
import { AskPanel } from './AskPanel';
import { provisionAccount, useEncryptionStore } from '../crypto/workspaceCrypto';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspaceStore } from '../stores/data/workspaceStore';
import {
  EMPTY_PAGES,
  useAiStatusStore,
  useAuthStore,
  useEditorViewStore,
  useMarkdownContentStore,
  usePageStore,
} from '../stores/StoresIndex';

function CodeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 7L3.5 12l5 5" />
      <path d="M15.5 7l5 5-5 5" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5v11.5" />
      <path d="M7.5 11l4.5 4.5L16.5 11" />
      <path d="M4.5 18.5h15" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4.5h11l3.5 3.5V19a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5Z" />
      <path d="M8 4.5V9h7V4.5" />
      <path d="M7.5 13.5h9V19h-9z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 12.5l5 5 10-10.5" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8-4.8-1.7 4.8-1.7L12 3.5Z" />
      <path d="M19 14.5l.75 2 2 .75-2 .75-.75 2-.75-2-2-.75 2-.75.75-2Z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="9" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 2.75h7.4L18.5 7.4v13.85a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V3.75a1 1 0 0 1 1-1Z" />
      <path d="M14 2.5V7h5" />
      <path d="M9 12.5h6M9 16h6" />
    </svg>
  );
}

function HashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.5 3.5l-3 17M17.5 3.5l-3 17M3.5 9h17M2.5 15h17" />
    </svg>
  );
}

export function MarkdownEditorPage() {
  const { workspaceId, pageId } = useParams();
  const { role, pageTitle } = useOutletContext<WorkspaceOutlet>();
  const accessToken = useAuthStore((state) => state.accessToken);
  const pages = usePageStore((state) => state.byWorkspace[workspaceId ?? ''] ?? EMPTY_PAGES);
  const loadContent = useMarkdownContentStore((state) => state.loadContent);
  const saveContent = useMarkdownContentStore((state) => state.saveContent);
  const aiEnabled = useAiStatusStore((state) => state.enabled);
  const fetchAiStatus = useAiStatusStore((state) => state.fetchStatus);
  const { resolved } = useTheme();
  const showSource = useEditorViewStore((state) => state.showSource);
  const toggleShowSource = useEditorViewStore((state) => state.toggleShowSource);
  const editable = canEdit(role);
  const page = pages.find((item) => item.id === pageId);
  const [content, setContent] = useState('');
  const [hash, setHash] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const encrypted = useWorkspaceStore((state) =>
    state.workspaces.some((workspace) => workspace.id === workspaceId && workspace.encrypted)
  );
  const unlocked = useEncryptionStore((state) => state.unlocked);
  const locking = useEncryptionStore((state) => state.lockingWorkspaceId === workspaceId);
  const timer = useRef<number | null>(null);
  const hashRef = useRef<string | undefined>(undefined);
  const contentRef = useRef(content);
  contentRef.current = content;

  const load = useCallback(async () => {
    if (!pageId) return;
    const entry = await loadContent(pageId);
    hashRef.current = entry.hash;
    setHash(entry.hash);
    setContent(entry.content);
    setDirty(false);
    setMessage(null);
  }, [pageId, loadContent]);

  useEffect(() => {
    if (locking || (encrypted && !unlocked)) return;
    void load().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Could not load markdown');
    });
  }, [load, locking, encrypted, unlocked]);

  useEffect(() => {
    void fetchAiStatus();
  }, [fetchAiStatus]);

  async function onUnlock(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setUnlocking(true);
    setMessage(null);
    try {
      await provisionAccount(accessToken, unlockPassword);
      setUnlockPassword('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not unlock pages');
    } finally {
      setUnlocking(false);
    }
  }

  async function save(next = content) {
    if (!pageId || !editable || locking) return;
    setSaving(true);
    try {
      const entry = await saveContent(pageId, next, hashRef.current);
      hashRef.current = entry.hash;
      setHash(entry.hash);
      setDirty(false);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save markdown');
    } finally {
      setSaving(false);
    }
  }

  function onChange(value: string) {
    setContent(value);
    setDirty(true);
    if (!editable || locking) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void save(value);
    }, 700);
  }

  function onDownload() {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stem = (pageTitle || page?.title || 'Untitled').replace(/[\\/:*?"<>|]+/g, '-');
    link.href = url;
    link.download = `${stem}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function insertAsk(text: string): boolean {
    const next = `${contentRef.current.trimEnd()}\n\n${text}\n`;
    setContent(next);
    setDirty(true);
    void save(next);
    return true;
  }

  if (page && pageKind(page) !== 'markdown') {
    return <p className="muted">This is not a markdown document.</p>;
  }

  if (locking) {
    return <p className="muted">Encrypting pages…</p>;
  }

  if (encrypted && !unlocked) {
    return (
      <form className="auth-card" onSubmit={(event) => void onUnlock(event)}>
        <h1>Unlock encrypted pages</h1>
        <p className="muted">Enter your password to decrypt pages in this tab. It is not stored.</p>
        <label>
          Password
          <input
            type="password"
            value={unlockPassword}
            onChange={(event) => setUnlockPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {message ? (
          <p className="error" role="alert">
            {message}
          </p>
        ) : null}
        <button type="submit" disabled={unlocking}>
          {unlocking ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>
    );
  }

  return (
    <>
      <div className="editor-toolbar">
        <span className="editor-title">{pageTitle || page?.title || 'Untitled'}</span>
        <div className="editor-toolbar-actions">
          <span className="kind-chip">
            <FileIcon />
            Markdown
          </span>
          <button
            type="button"
            className={`editor-tool-btn${showSource ? ' on' : ''}`}
            onClick={toggleShowSource}
            aria-pressed={showSource}
            title={showSource ? 'Hide source' : 'Show source'}
          >
            <CodeIcon />
            {showSource ? 'Hide source' : 'Show source'}
          </button>
          <button type="button" className="editor-tool-btn" onClick={onDownload} title="Download as .md">
            <DownloadIcon />
            Download .md
          </button>
          {accessToken && aiEnabled && !encrypted ? (
            <button
              type="button"
              className={`editor-tool-btn${askOpen ? ' on' : ''}`}
              onClick={() => setAskOpen((open) => !open)}
              title="Ask about this page"
            >
              <SparkleIcon />
              Ask
            </button>
          ) : null}
          {editable ? (
            <button
              type="button"
              className="editor-tool-btn save-btn"
              onClick={() => void save()}
              disabled={saving || !dirty}
            >
              {dirty || saving ? <SaveIcon /> : <CheckIcon />}
              {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
            </button>
          ) : (
            <span className="editor-meta">
              <LockIcon />
              View only
            </span>
          )}
          {hash ? (
            <span className="editor-meta" title={hash}>
              <HashIcon />
              {hash.slice(0, 8)}
            </span>
          ) : null}
        </div>
      </div>
      {message ? (
        <p className="error editor-toolbar-error" role="alert">
          {message}
        </p>
      ) : null}
      {askOpen && accessToken && pageId ? (
        <AskPanel
          pageId={pageId}
          accessToken={accessToken}
          editable={editable}
          getContext={() => contentRef.current}
          onInsert={insertAsk}
        />
      ) : null}
      <div
        className={`markdown-split${editable ? '' : ' readonly'}${showSource ? '' : ' preview-only'}`}
      >
        {showSource ? (
          <div className="markdown-source">
            <CodeMirror
              value={content}
              height="100%"
              theme={resolved}
              extensions={[markdown(), EditorView.lineWrapping]}
              onChange={onChange}
              readOnly={!editable}
              basicSetup={{ lineNumbers: true, foldGutter: true }}
            />
          </div>
        ) : null}
        <div className="markdown-preview">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || '_Empty document._'}</ReactMarkdown>
        </div>
      </div>
    </>
  );
}
