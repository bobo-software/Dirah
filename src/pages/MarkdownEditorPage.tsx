import { useCallback, useEffect, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useOutletContext, useParams } from 'react-router-dom';
import { getMarkdown, putMarkdown } from '../api/pages';
import { getAiStatus } from '../api/ai';
import { canEdit, type WorkspaceOutlet } from './workspaceContext';
import { pageKind } from './pageKind';
import { AskPanel } from './AskPanel';
import { useTheme } from '../theme/ThemeContext';

export function MarkdownEditorPage() {
  const { pageId } = useParams();
  const { role, accessToken, pageTitle, pages, refreshPages } = useOutletContext<WorkspaceOutlet>();
  const { resolved } = useTheme();
  const editable = canEdit(role);
  const page = pages.find((item) => item.id === pageId);
  const [content, setContent] = useState('');
  const [hash, setHash] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const timer = useRef<number | null>(null);
  const hashRef = useRef<string | undefined>(undefined);
  const contentRef = useRef(content);
  contentRef.current = content;

  const load = useCallback(async () => {
    if (!accessToken || !pageId) return;
    const body = await getMarkdown(accessToken, pageId);
    hashRef.current = body.hash;
    setHash(body.hash);
    setContent(body.content);
    setDirty(false);
    setMessage(null);
  }, [accessToken, pageId]);

  useEffect(() => {
    void load().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Could not load markdown');
    });
  }, [load]);

  useEffect(() => {
    if (!accessToken) return;
    void getAiStatus(accessToken)
      .then(setAiEnabled)
      .catch(() => setAiEnabled(false));
  }, [accessToken]);

  async function save(next = content) {
    if (!accessToken || !pageId || !editable) return;
    setSaving(true);
    try {
      const body = await putMarkdown(accessToken, pageId, next, hashRef.current);
      hashRef.current = body.hash;
      setHash(body.hash);
      setDirty(false);
      setMessage(null);
      await refreshPages();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save markdown');
    } finally {
      setSaving(false);
    }
  }

  function onChange(value: string) {
    setContent(value);
    setDirty(true);
    if (!editable) return;
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

  return (
    <>
      <div className="editor-toolbar">
        <span className="kind-chip">Markdown</span>
        <button type="button" className="linkish" onClick={onDownload}>
          Download .md
        </button>
        {editable ? (
          <button type="button" className="linkish" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
        ) : (
          <span className="muted">View only</span>
        )}
        {accessToken && aiEnabled ? (
          <button
            type="button"
            className={`linkish${askOpen ? ' on' : ''}`}
            onClick={() => setAskOpen((open) => !open)}
          >
            Ask
          </button>
        ) : null}
        {hash ? <span className="muted">etag {hash.slice(0, 8)}</span> : null}
        {message ? (
          <p className="error" role="alert">
            {message}
          </p>
        ) : null}
      </div>
      {askOpen && accessToken && pageId ? (
        <AskPanel
          pageId={pageId}
          accessToken={accessToken}
          editable={editable}
          getContext={() => contentRef.current}
          onInsert={insertAsk}
        />
      ) : null}
      <div className={editable ? 'markdown-split' : 'markdown-split readonly'}>
        {editable ? (
          <CodeMirror
            value={content}
            height="100%"
            theme={resolved}
            extensions={[markdown(), EditorView.lineWrapping]}
            onChange={onChange}
            basicSetup={{ lineNumbers: true, foldGutter: true }}
          />
        ) : (
          <pre className="markdown-source">{content}</pre>
        )}
        <div className="markdown-preview">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || '_Empty document._'}</ReactMarkdown>
        </div>
      </div>
    </>
  );
}
