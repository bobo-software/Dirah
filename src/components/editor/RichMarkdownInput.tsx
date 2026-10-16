import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { MAX_BLOB_BYTES, uploadBlob } from '../../api/blobs';
import { useAuthStore } from '../../stores/StoresIndex';
import { BlobImageNode } from './blobImageNode';
import { EmojiPicker } from './EmojiPicker';

/** Empty trailing paragraphs serialise as blank lines or `&nbsp;`; drop them. */
function cleanMarkdown(markdown: string): string {
  return markdown.replace(/(?:\s|&nbsp;)+$/u, '');
}

/**
 * Shared markdown input: rich text with inline images, emoji, file attach,
 * paste and drop. Reads and writes markdown, so it can replace any textarea
 * whose value is markdown. Attach needs a workspace to upload into.
 */
export function RichMarkdownInput({
  value,
  onChange,
  label,
  placeholder,
  workspaceId,
  autoFocus,
  onSubmit,
  onError,
  className,
  actions,
}: {
  value: string;
  onChange: (markdown: string) => void;
  label: string;
  placeholder?: string;
  /** Enables attach, paste and drop of files. */
  workspaceId?: string;
  autoFocus?: boolean;
  /** Called on ⌘/Ctrl + Enter. */
  onSubmit?: () => void;
  onError?: (message: string) => void;
  className?: string;
  /** Right side of the toolbar; told whether uploads are still running. */
  actions?: (state: { uploading: boolean }) => ReactNode;
}) {
  const [uploading, setUploading] = useState(0);
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastValue = useRef<string | null>(null);
  const callbacks = useRef({ onChange, onSubmit, onError });
  const attachRef = useRef<(files: File[]) => void>(() => undefined);

  useEffect(() => {
    callbacks.current = { onChange, onSubmit, onError };
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false }, heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      BlobImageNode,
      Markdown,
    ],
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: { class: 'rich-input-prose', 'aria-label': label, role: 'textbox', 'aria-multiline': 'true' },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && callbacks.current.onSubmit) {
          event.preventDefault();
          callbacks.current.onSubmit();
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length === 0 || !workspaceId) return false;
        event.preventDefault();
        attachRef.current(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
        if (files.length === 0 || !workspaceId) return false;
        event.preventDefault();
        attachRef.current(files);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = cleanMarkdown(current.getMarkdown());
      lastValue.current = markdown;
      callbacks.current.onChange(markdown);
    },
  });

  // Follow outside changes to `value` (e.g. cleared after posting) without echoing our own edits.
  useEffect(() => {
    if (!editor || value === lastValue.current) return;
    lastValue.current = value;
    // Deferred: React node views (images) can't render synchronously inside an effect.
    queueMicrotask(() => {
      if (!editor.isDestroyed) editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
    });
  }, [editor, value]);

  async function attach(files: File[]) {
    const accessToken = useAuthStore.getState().accessToken;
    if (!editor || !workspaceId || !accessToken) return;
    for (const file of files) {
      if (file.size > MAX_BLOB_BYTES) {
        callbacks.current.onError?.(`${file.name || 'That file'} is larger than 12 MB`);
        continue;
      }
      setUploading((count) => count + 1);
      try {
        const blob = await uploadBlob(accessToken, workspaceId, file);
        insertAttachment(editor, { name: file.name || 'pasted image', url: blob.url, image: file.type.startsWith('image/') });
      } catch (err) {
        callbacks.current.onError?.(err instanceof Error ? err.message : `Could not attach ${file.name}`);
      } finally {
        setUploading((count) => count - 1);
      }
    }
  }
  useEffect(() => {
    attachRef.current = (files) => void attach(files);
  });

  return (
    <div className={`rich-input${className ? ` ${className}` : ''}`}>
      <div className="rich-input-box" onClick={() => editor?.commands.focus()}>
        <EditorContent editor={editor} />
        {uploading > 0 ? <p className="rich-input-uploading">Uploading {uploading > 1 ? `${uploading} files` : 'file'}…</p> : null}
      </div>
      <div className="rich-input-bar">
        <button
          type="button"
          className="rich-input-tool"
          aria-label="Insert emoji"
          aria-haspopup="dialog"
          aria-expanded={Boolean(emojiAnchor)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => setEmojiAnchor(emojiAnchor ? null : event.currentTarget)}
        >
          <SmileIcon />
        </button>
        {workspaceId ? (
          <>
            <button
              type="button"
              className="rich-input-tool"
              aria-label="Attach files"
              title="Attach files (up to 12 MB each)"
              onClick={() => fileRef.current?.click()}
            >
              <PaperclipIcon />
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                void attach(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />
          </>
        ) : null}
        <span className="rich-input-spacer" />
        {actions?.({ uploading: uploading > 0 })}
      </div>
      {emojiAnchor ? (
        <EmojiPicker
          anchor={emojiAnchor}
          onPick={(emoji) => {
            editor?.chain().focus().insertContent(emoji).run();
            setEmojiAnchor(null);
          }}
          onClose={() => setEmojiAnchor(null)}
        />
      ) : null}
    </div>
  );
}

/** Images go in their own paragraph with an empty one after, so typing continues below. */
function insertAttachment(editor: Editor, attachment: { name: string; url: string; image: boolean }) {
  if (attachment.image) {
    editor
      .chain()
      .focus()
      .insertContent([
        { type: 'paragraph', content: [{ type: 'blobImage', attrs: { src: attachment.url, alt: attachment.name } }] },
        { type: 'paragraph' },
      ])
      .run();
    return;
  }
  editor
    .chain()
    .focus()
    .insertContent([
      { type: 'text', text: `📎 ${attachment.name}`, marks: [{ type: 'link', attrs: { href: attachment.url } }] },
      { type: 'text', text: ' ' },
    ])
    .run();
}

function SmileIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.75" />
      <path d="M8.5 14.25c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8" />
      <path d="M9.25 9.75h.01M14.75 9.75h.01" strokeWidth="2.4" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m20.2 11.6-7.9 7.9a5 5 0 0 1-7.1-7.1l8.3-8.3a3.4 3.4 0 0 1 4.8 4.8l-8.3 8.3a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6" />
    </svg>
  );
}
