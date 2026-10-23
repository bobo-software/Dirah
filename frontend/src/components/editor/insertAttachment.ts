import type { Editor } from '@tiptap/core';

/**
 * Images go in their own paragraph, splitting the one at the caret, so typing
 * continues below. An empty paragraph follows only when nothing comes after the
 * caret; otherwise the rest of the split paragraph is the line you type on.
 */
export function insertAttachment(
  editor: Editor,
  attachment: { name: string; url: string; image: boolean; uploadId?: string }
) {
  if (attachment.image) {
    const { $to } = editor.state.selection;
    const atEnd = $to.parentOffset === $to.parent.content.size;
    const image = { type: 'paragraph', content: [{ type: 'blobImage', attrs: { src: attachment.url, alt: attachment.name, uploadId: attachment.uploadId ?? null } }] };
    editor
      .chain()
      .focus()
      .insertContent(atEnd ? [image, { type: 'paragraph' }] : [image])
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

/**
 * Swaps the preview of an upload (see BlobImageNode's `uploadId`) for the stored
 * image, or removes it when the upload failed. Kept out of undo history: the
 * upload finishing isn't an edit to undo. Does nothing if the preview is gone.
 */
export function settleUpload(editor: Editor, uploadId: string, url: string | null): boolean {
  if (editor.isDestroyed) return false;
  let found: { pos: number; size: number; attrs: Record<string, unknown> } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === 'blobImage' && node.attrs.uploadId === uploadId) {
      found = { pos, size: node.nodeSize, attrs: node.attrs };
      return false;
    }
    return true;
  });
  if (!found) return false;
  const { pos, size, attrs } = found as { pos: number; size: number; attrs: Record<string, unknown> };
  const tr = editor.state.tr.setMeta('addToHistory', false);
  if (url) tr.setNodeMarkup(pos, undefined, { ...attrs, src: url, uploadId: null });
  else tr.delete(pos, pos + size);
  editor.view.dispatch(tr);
  return true;
}
