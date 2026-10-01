import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { ApiError, type PublicNote } from '../../api/client';
import type { NoteBody } from '../../api/notes';
import { EMPTY_NOTES, useNoteStore, useWorkspaceStore } from '../../stores/StoresIndex';
import { NoteGlyph } from './NoteTree';
import { NoteToolbar } from './NoteToolbar';

const SAVE_DELAY_MS = 800;

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

function breadcrumbs(notes: PublicNote[], note: PublicNote | undefined): PublicNote[] {
  const byId = new Map(notes.map((item) => [item.id, item]));
  const trail: PublicNote[] = [];
  const seen = new Set<string>();
  let cursor = note?.parentId ? byId.get(note.parentId) : undefined;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    trail.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return trail;
}

function saveLabel(state: SaveState): string {
  if (state === 'saving') return 'Saving…';
  if (state === 'dirty') return 'Unsaved changes';
  if (state === 'error') return 'Not saved';
  return 'Saved';
}

export function NotePage() {
  const { workspaceId = '', noteId = '' } = useParams();
  const encrypted = useWorkspaceStore((state) =>
    state.workspaces.some((workspace) => workspace.id === workspaceId && workspace.encrypted)
  );
  if (encrypted) {
    return <p className="muted note-page-empty">Notes aren’t available in encrypted workspaces yet.</p>;
  }
  // Keyed so each note mounts with fresh editor and save state.
  return <NoteEditor key={noteId} workspaceId={workspaceId} noteId={noteId} />;
}

function NoteEditor({ workspaceId, noteId }: { workspaceId: string; noteId: string }) {
  const notes = useNoteStore((state) => state.byWorkspace[workspaceId] ?? EMPTY_NOTES);
  const loaded = useNoteStore((state) => state.loadedWorkspaces.has(workspaceId));
  const fetchNotes = useNoteStore((state) => state.fetchNotes);
  const loadContent = useNoteStore((state) => state.loadContent);
  const saveContent = useNoteStore((state) => state.saveContent);
  const patchNote = useNoteStore((state) => state.patchNote);
  const note = notes.find((item) => item.id === noteId);
  const editable = note?.editable ?? false;

  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [title, setTitle] = useState('');
  // Stored markdown the editor couldn't render; editing would overwrite it.
  const [unsupported, setUnsupported] = useState(false);

  // Save bookkeeping lives in refs so the editor callback never sees stale state.
  const hashRef = useRef<string | undefined>(undefined);
  const pendingRef = useRef<string | null>(null);
  // Last markdown known to be on the server, so no-op updates don't save.
  const savedRef = useRef('');
  const savingRef = useRef(false);
  const conflictRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  function schedule() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
  }

  async function flush() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const content = pendingRef.current;
    if (content === null || savingRef.current || conflictRef.current) return;
    pendingRef.current = null;
    savingRef.current = true;
    setSaveState('saving');
    try {
      const body = await saveContent(noteId, content, hashRef.current);
      hashRef.current = body.hash;
      savedRef.current = content;
      setSaveState(pendingRef.current === null ? 'saved' : 'dirty');
    } catch (error) {
      pendingRef.current ??= content;
      if (error instanceof ApiError && error.code === 'HASH_MISMATCH') {
        conflictRef.current = true;
        setConflict(true);
        setSaveState('dirty');
      } else {
        setSaveState('error');
        setMessage(error instanceof Error ? error.message : 'Could not save note');
      }
    } finally {
      savingRef.current = false;
      if (pendingRef.current !== null && !conflictRef.current) schedule();
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Markdown,
    ],
    editable: false,
    editorProps: { attributes: { class: 'note-prose', 'aria-label': 'Note body' } },
    onUpdate: ({ editor: current }) => {
      if (!current.isEditable) return;
      const markdown = current.getMarkdown();
      if (markdown === savedRef.current && !savingRef.current) {
        pendingRef.current = null;
        setSaveState('saved');
        return;
      }
      pendingRef.current = markdown;
      setSaveState('dirty');
      schedule();
    },
  });

  function applyBody(body: NoteBody) {
    hashRef.current = body.hash;
    pendingRef.current = null;
    conflictRef.current = false;
    setConflict(false);
    setSaveState('saved');
    setTitle(body.note.title);
    // Loading isn't an edit: keep it out of undo history so Undo can't blank the note.
    editor
      .chain()
      .setMeta('addToHistory', false)
      .setContent(body.content, { contentType: 'markdown', emitUpdate: false })
      .run();
    const lost = body.content.trim() !== '' && editor.getText().trim() === '';
    setUnsupported(lost);
    editor.setEditable(body.note.editable && !lost, false);
    // Compare against the editor's own serialisation, which may normalise the stored text.
    savedRef.current = editor.getMarkdown();
    setReady(true);
  }

  const onLoaded = useEffectEvent(applyBody);
  const onUnmount = useEffectEvent(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const content = pendingRef.current;
    if (content !== null && !conflictRef.current && !savingRef.current) {
      void saveContent(noteId, content, hashRef.current).catch(() => undefined);
    }
  });

  useEffect(() => {
    let cancelled = false;
    loadContent(noteId)
      .then((body) => {
        if (!cancelled) onLoaded(body);
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Could not load note');
      });
    // Leaving the note saves whatever is still pending.
    return () => {
      cancelled = true;
      onUnmount();
    };
  }, [noteId, loadContent]);

  useEffect(() => {
    if (!loaded && workspaceId) void fetchNotes(workspaceId).catch(() => undefined);
  }, [loaded, workspaceId, fetchNotes]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (pendingRef.current !== null || savingRef.current) event.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  async function onReloadLatest() {
    try {
      applyBody(await loadContent(noteId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not reload note');
    }
  }

  async function onKeepMine() {
    try {
      const latest = await loadContent(noteId);
      hashRef.current = latest.hash;
      conflictRef.current = false;
      setConflict(false);
      pendingRef.current = editor.getMarkdown();
      await flush();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save note');
    }
  }

  async function commitTitle(event?: FormEvent) {
    event?.preventDefault();
    if (!note || !editable) return;
    const next = title.trim() || 'Untitled';
    setTitle(next);
    if (next === note.title) return;
    try {
      await patchNote(note.id, { title: next });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not rename note');
    }
  }

  const trail = breadcrumbs(notes, note);

  return (
    <article className="note-page">
      <nav className="note-crumbs" aria-label="Breadcrumbs">
        <Link to={`/w/${workspaceId}?tab=notes`}>Notes</Link>
        {trail.map((item) => (
          <span key={item.id}>
            <span aria-hidden="true">/</span>
            <Link to={`/w/${workspaceId}/n/${item.id}`}>{item.title}</Link>
          </span>
        ))}
        {ready && editable && !unsupported ? <span className={`note-save-state ${saveState}`}>{saveLabel(saveState)}</span> : null}
      </nav>
      {conflict ? (
        <div className="note-banner warning" role="alert">
          <span>This note changed somewhere else since you opened it.</span>
          <button type="button" onClick={() => void onReloadLatest()}>
            Reload latest
          </button>
          <button type="button" className="linkish" onClick={() => void onKeepMine()}>
            Overwrite with mine
          </button>
        </div>
      ) : null}
      {ready && note && !editable ? <p className="note-banner">Shared by another member. View only.</p> : null}
      {ready && unsupported ? (
        <p className="note-banner warning" role="alert">
          This note contains content the editor can’t display yet, so editing is turned off to protect it.
        </p>
      ) : null}
      {message ? (
        <p className="error" role="alert">
          {message}
        </p>
      ) : null}
      <header className="note-header">
        {note ? <NoteGlyph note={note} /> : null}
        <form onSubmit={(event) => void commitTitle(event)}>
          <input
            className="note-title-input"
            aria-label="Note title"
            value={title}
            placeholder="Untitled"
            readOnly={!editable}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void commitTitle()}
          />
        </form>
      </header>
      {!ready && !message ? <p className="muted">Loading note…</p> : null}
      {ready && editable && !unsupported ? <NoteToolbar editor={editor} /> : null}
      <EditorContent editor={editor} className={ready ? 'note-editor' : 'note-editor hidden'} />
    </article>
  );
}
