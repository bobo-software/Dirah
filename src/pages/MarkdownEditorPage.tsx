import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useOutletContext, useParams } from 'react-router-dom';
import { canEdit, type WorkspaceOutlet } from './workspaceContext';
import {
  AskPanel,
  CheckIcon,
  CodeIcon,
  DownloadIcon,
  FileIcon,
  HashIcon,
  LockIcon,
  SaveIcon,
  SparkleIcon,
  pageKind,
} from '../components/ComponentsIndex';
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
