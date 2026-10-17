import { useEffect, useEffectEvent, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { ColumnTypeMarkdown, TypedTable, TypedTableHeader } from './table/typedTable';
import { MAX_BLOB_BYTES, NOTE_IMAGE_TYPES, uploadNoteImage } from '../../api/blobs';
import { ApiError, type PublicNote } from '../../api/client';
import type { NoteBody } from '../../api/notes';
import { EMPTY_NOTES, useAuthStore, useNoteStore } from '../../stores/StoresIndex';
import { BlobImageNode } from '../editor/blobImageNode';
import { insertAttachment, settleUpload } from '../editor/insertAttachment';
import { NoteGlyph } from './NoteTree';
import { breadcrumbs } from './noteTreeModel';
import { NoteLink } from './links/noteLink';
import { NoteSelectionMenu } from './links/NoteSelectionMenu';
import { NoteBacklinks } from './links/NoteBacklinks';
import { NoteFormatter } from './formatter/NoteFormatter';
import { TasksIcon } from '../layout/SectionIcons';
import { useSendNoteToTasks } from '../tasks/useSendNoteToTasks';
import { Button } from '../buttons/Button';

const SAVE_DELAY_MS = 800;

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

function saveLabel(state: SaveState): string {
  if (state === 'saving') return 'Saving…';
  if (state === 'dirty') return 'Unsaved changes';
  if (state === 'error') return 'Not saved';
  return 'Saved';
}

/** Image files from a paste or drop, or none (then the editor handles the event as usual). */
function imageFiles(list: FileList | undefined | null): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith('image/'));
}

export function NoteEditor({
  workspaceId,
  noteId,
  variant = 'page',
  actions,
}: {
  workspaceId: string;
  noteId: string;
  // 'peek' drops the breadcrumbs for use inside a modal; `actions` sits beside the save state.
  variant?: 'page' | 'peek';
  actions?: ReactNode;
}) {
  const notes = useNoteStore((state) => state.byWorkspace[workspaceId] ?? EMPTY_NOTES);
  const loaded = useNoteStore((state) => state.loadedWorkspaces.has(workspaceId));
  const fetchNotes = useNoteStore((state) => state.fetchNotes);
  const loadContent = useNoteStore((state) => state.loadContent);
  const saveContent = useNoteStore((state) => state.saveContent);
  const patchNote = useNoteStore((state) => state.patchNote);
  const createNote = useNoteStore((state) => state.createNote);
  const note = notes.find((item) => item.id === noteId);
  const editable = note?.editable ?? false;
  const sendToTasks = useSendNoteToTasks(workspaceId);

  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [title, setTitle] = useState('');
  // Stored markdown the editor couldn't render; editing would overwrite it.
  const [unsupported, setUnsupported] = useState(false);
  // Images still uploading; each lands at the caret when it's done.
  const [uploading, setUploading] = useState(0);

  // Save bookkeeping lives in refs so the editor callback never sees stale state.
  const hashRef = useRef<string | undefined>(undefined);
  const pendingRef = useRef<string | null>(null);
  // Last markdown known to be on the server, so no-op updates don't save.
  const savedRef = useRef('');
  const savingRef = useRef(false);
  const conflictRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  // A sub-note of this note; links and "Turn into sub-note" create them in place.
  function createSubnote(subTitle: string): Promise<PublicNote> {
    return createNote(workspaceId, { parentId: noteId, title: subTitle });
  }
  const createSubnoteRef = useRef(createSubnote);
  createSubnoteRef.current = createSubnote;

  /**
   * Puts each image on its own line at the caret straight away, as a local
   * preview, then uploads it to this note; the preview becomes the stored image
   * when its upload finishes, or goes away (with a message) if it fails.
   */
  async function attachImages(files: File[]) {
    const accessToken = useAuthStore.getState().accessToken;
    if (!accessToken || !editor.isEditable) return;
    const uploads: { file: File; name: string; uploadId: string; preview: string }[] = [];
    for (const file of files) {
      const name = file.name || 'pasted image';
      if (!NOTE_IMAGE_TYPES.includes(file.type)) {
        setMessage(`${name} isn't an image this note can hold (PNG, JPEG, GIF, WebP or HEIC)`);
        continue;
      }
      if (file.size > MAX_BLOB_BYTES) {
        setMessage(`${name} is larger than 12 MB`);
        continue;
      }
      const upload = { file, name, uploadId: crypto.randomUUID(), preview: URL.createObjectURL(file) };
      insertAttachment(editor, { name, url: upload.preview, image: true, uploadId: upload.uploadId });
      uploads.push(upload);
    }
    await Promise.all(
      uploads.map(async ({ file, name, uploadId, preview }) => {
        setUploading((count) => count + 1);
        try {
          const blob = await uploadNoteImage(accessToken, noteId, file);
          settleUpload(editor, uploadId, blob.url);
        } catch (error) {
          settleUpload(editor, uploadId, null);
          setMessage(`Couldn’t upload ${name}${error instanceof Error ? `: ${error.message}` : ''}`);
        } finally {
          setUploading((count) => count - 1);
          // After the stored image has replaced the preview, so it never shows a broken image.
          window.setTimeout(() => URL.revokeObjectURL(preview), 30_000);
        }
      })
    );
  }
  const attachImagesRef = useRef(attachImages);
  attachImagesRef.current = attachImages;

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
      TableKit.configure({ table: false, tableHeader: false }),
      TypedTable,
      TypedTableHeader,
      ColumnTypeMarkdown,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      BlobImageNode,
      NoteLink.configure({
        workspaceId,
        noteId,
        createSubnote: (subTitle) => createSubnoteRef.current(subTitle),
      }),
      Markdown,
    ],
    editable: false,
    editorProps: {
      attributes: { class: 'note-prose', 'aria-label': 'Note body' },
      handlePaste: (view, event) => {
        const files = imageFiles(event.clipboardData?.files);
        if (files.length === 0 || !view.editable) return false;
        event.preventDefault();
        void attachImagesRef.current(files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = imageFiles((event as DragEvent).dataTransfer?.files);
        if (files.length === 0 || !view.editable) return false;
        event.preventDefault();
        void attachImagesRef.current(files);
        return true;
      },
    },
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

  /** Saves pending typing (and waits out an in-flight save) so the server reads the latest body. */
  async function settleSaves() {
    await flush();
    for (let waited = 0; savingRef.current && waited < 5000; waited += 100) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    if (pendingRef.current !== null) await flush();
  }

  const trail = breadcrumbs(notes, note);
  const saveIndicator =
    ready && editable && !unsupported ? (
      <span className={`note-save-state ${saveState}`}>{saveLabel(saveState)}</span>
    ) : null;

  return (
    <article className={variant === 'peek' ? 'note-peek-editor' : 'note-page'}>
      {variant === 'peek' ? (
        <div className="note-peek-bar">
          {saveIndicator ?? <span />}
          {actions}
        </div>
      ) : (
        <nav className="note-crumbs" aria-label="Breadcrumbs">
          <Link to={`/w/${workspaceId}`}>Notes</Link>
          {trail.map((item, index) => {
            const current = item.id === note?.id && index === trail.length - 1;
            return (
              <span key={item.id}>
                <span aria-hidden="true">/</span>
                {current ? (
                  <span aria-current="page">{item.title}</span>
                ) : (
                  <Link to={`/w/${workspaceId}/n/${item.id}`}>{item.title}</Link>
                )}
              </span>
            );
          })}
          <span className="note-crumbs-actions">
            {saveIndicator}
            {ready && note && !unsupported ? (
              <Button variant="link"
                type="button"
                className="note-send-tasks"
                onClick={() => void sendToTasks.send(noteId, settleSaves)}
                disabled={sendToTasks.sending}
                title="Copy this note’s list items into a new checklist"
              >
                <TasksIcon />
                {sendToTasks.sending ? 'Sending…' : 'Send to Tasks'}
              </Button>
            ) : null}
          </span>
        </nav>
      )}
      {conflict ? (
        <div className="note-banner warning" role="alert">
          <span>This note changed somewhere else since you opened it.</span>
          <Button type="button" onClick={() => void onReloadLatest()}>
            Reload latest
          </Button>
          <Button variant="link" type="button" onClick={() => void onKeepMine()}>
            Overwrite with mine
          </Button>
        </div>
      ) : null}
      {ready && note && !editable ? <p className="note-banner">Shared by another member. View only.</p> : null}
      {ready && unsupported ? (
        <p className="note-banner warning" role="alert">
          This note contains content the editor can’t display yet, so editing is turned off to protect it.
        </p>
      ) : null}
      {message ?? sendToTasks.error ? (
        <p className="error" role="alert">
          {message ?? sendToTasks.error}
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
      {ready && editable && !unsupported ? (
        <NoteFormatter editor={editor} uploading={uploading} onAttachImages={(files) => void attachImages(files)} />
      ) : null}
      {ready && editable && !unsupported ? (
        <NoteSelectionMenu
          editor={editor}
          workspaceId={workspaceId}
          noteId={noteId}
          createSubnote={createSubnote}
          onError={setMessage}
        />
      ) : null}
      <EditorContent editor={editor} className={ready ? 'note-editor' : 'note-editor hidden'} />
      {ready && variant === 'page' ? <NoteBacklinks workspaceId={workspaceId} noteId={noteId} /> : null}
    </article>
  );
}
