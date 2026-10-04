import type { Editor, JSONContent } from '@tiptap/core';
import type { Fragment, Node as PMNode } from '@tiptap/pm/model';
import type { PublicNote } from '../../../api/client';
import { noteLinkContent } from './noteLink';

const MAX_TITLE = 80;

function plainText(node: PMNode | Fragment): string {
  const size = 'nodeSize' in node ? node.content.size : node.size;
  return node.textBetween(0, size, '\n', (leaf) =>
    leaf.type.name === 'noteLink' ? String(leaf.attrs.label) : ''
  );
}

function shortTitle(text: string): string {
  const line = text.split('\n').find((part) => part.trim())?.trim() ?? '';
  if (line.length <= MAX_TITLE) return line;
  const cut = line.slice(0, MAX_TITLE);
  const space = cut.lastIndexOf(' ');
  return `${(space > 40 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The selected text as plain text, for labelling a link made from it. */
export function selectedText(editor: Editor): string {
  const { from, to } = editor.state.selection;
  return plainText(editor.state.doc.slice(from, to).content).replace(/\s+/g, ' ').trim();
}

/**
 * Title and markdown body for a sub-note made from the selection: a leading
 * heading becomes the title, a single short line is the title alone, and
 * anything else keeps all its text with the first line as title.
 */
export function selectionDraft(editor: Editor): { title: string; body: string } | null {
  const { from, to, empty } = editor.state.selection;
  if (empty) return null;
  const content = editor.state.doc.slice(from, to).content;
  const serialize = (nodes: JSONContent[]) =>
    nodes.length === 0 ? '' : (editor.markdown?.serialize({ type: 'doc', content: nodes }) ?? '').trim();
  const json = (content.toJSON() ?? []) as JSONContent[];
  const text = plainText(content).trim();
  if (!text) return null;
  const first = content.firstChild;
  if (first?.type.name === 'heading' && plainText(first).trim()) {
    return { title: shortTitle(plainText(first)), body: serialize(json.slice(1)) };
  }
  if (content.childCount === 1 && !text.includes('\n') && text.length <= MAX_TITLE) {
    return { title: text, body: '' };
  }
  return { title: shortTitle(text), body: serialize(json) };
}

/**
 * Moves the selection into a new child note and leaves a link in its place.
 * If the note changed while the sub-note was being created, the original text
 * stays and the link is added after it instead.
 */
export async function extractSelectionToSubnote(
  editor: Editor,
  createSubnote: (title: string) => Promise<PublicNote>,
  saveContent: (noteId: string, content: string) => Promise<unknown>
): Promise<PublicNote | null> {
  const draft = selectionDraft(editor);
  if (!draft) return null;
  const { from, to, $from, $to } = editor.state.selection;
  // Across blocks the first one would survive (a heading stays a heading), so the link gets its own paragraph.
  const spansBlocks = $from.parent !== $to.parent;
  const before = editor.state.doc;
  const note = await createSubnote(draft.title);
  if (draft.body) await saveContent(note.id, draft.body);
  const link = noteLinkContent({ id: note.id, label: note.title });
  if (editor.isDestroyed) return note;
  if (editor.state.doc.eq(before)) {
    editor
      .chain()
      .focus()
      .insertContentAt({ from, to }, spansBlocks ? { type: 'paragraph', content: [link] } : link)
      .run();
  } else {
    const end = editor.state.selection.to;
    editor.chain().focus().insertContentAt(end, [{ type: 'text', text: ' ' }, link]).run();
  }
  return note;
}
