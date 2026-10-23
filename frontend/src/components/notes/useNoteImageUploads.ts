import { useState } from 'react';
import type { Editor } from '@tiptap/core';
import { MAX_BLOB_BYTES, NOTE_IMAGE_TYPES, uploadNoteImage } from '../../api/blobs';
import { useAuthStore } from '../../stores/StoresIndex';
import { insertAttachment, settleUpload } from '../editor/insertAttachment';

/** Image files from a paste or drop; empty when there are none (the editor then handles the event as usual). */
export function imageFiles(list: FileList | undefined | null): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith('image/'));
}

/** Why `file` can't go in a note, or null when it can. */
function rejection(file: File, name: string): string | null {
  if (!NOTE_IMAGE_TYPES.includes(file.type)) return `${name} isn't an image this note can hold (PNG, JPEG, GIF, WebP or HEIC)`;
  if (file.size > MAX_BLOB_BYTES) return `${name} is larger than 12 MB`;
  return null;
}

/**
 * Images into a note. `attach` puts each image on its own line at the caret
 * straight away, as a local preview, then uploads it to the note; the preview
 * becomes the stored image when its upload finishes, or goes away (with a
 * message to `onError`) if it fails. `uploading` counts uploads still running.
 */
export function useNoteImageUploads(noteId: string, onError: (message: string) => void) {
  const [uploading, setUploading] = useState(0);

  async function attach(editor: Editor, files: File[]) {
    const accessToken = useAuthStore.getState().accessToken;
    if (!accessToken || !editor.isEditable) return;
    const queued: { file: File; name: string; uploadId: string; preview: string }[] = [];
    for (const file of files) {
      const name = file.name || 'pasted image';
      const problem = rejection(file, name);
      if (problem) {
        onError(problem);
        continue;
      }
      const upload = { file, name, uploadId: crypto.randomUUID(), preview: URL.createObjectURL(file) };
      insertAttachment(editor, { name, url: upload.preview, image: true, uploadId: upload.uploadId });
      queued.push(upload);
    }
    await Promise.all(
      queued.map(async ({ file, name, uploadId, preview }) => {
        setUploading((count) => count + 1);
        try {
          const blob = await uploadNoteImage(accessToken, noteId, file);
          settleUpload(editor, uploadId, blob.url);
        } catch (error) {
          settleUpload(editor, uploadId, null);
          onError(`Couldn’t upload ${name}${error instanceof Error ? `: ${error.message}` : ''}`);
        } finally {
          setUploading((count) => count - 1);
          // Later, so the preview never flashes broken while the stored image loads.
          window.setTimeout(() => URL.revokeObjectURL(preview), 30_000);
        }
      })
    );
  }

  return { uploading, attach };
}
