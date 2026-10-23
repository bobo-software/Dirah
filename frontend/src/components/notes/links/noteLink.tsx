import { createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { mergeAttributes, Node, type Editor, type Range } from '@tiptap/core';
import type { ResolvedPos } from '@tiptap/pm/model';
import { PluginKey } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Suggestion, type SuggestionMatch } from '@tiptap/suggestion';
import type { PublicNote } from '../../../api/client';
import { useNoteStore } from '../../../stores/StoresIndex';
import { exclusive, release } from '../table/menuDismiss';
import { NoteLinkPicker, type NoteLinkPickerHandle } from './NoteLinkPicker';
import { NoteLinkView } from './NoteLinkView';
import { cleanLinkLabel, noteLinkItems, type NoteLinkItem } from './noteLinkItems';

export type NoteLinkOptions = {
  workspaceId: string;
  noteId: string;
  /** Creates a child of the open note; null when the viewer can't edit it. */
  createSubnote: ((title: string) => Promise<PublicNote>) | null;
};

export type NoteLinkAttrs = { id: string | null; label: string };

const LINK_RE = /^\[\[([^[\]|\n]+?)(?:\|([0-9a-fA-F-]{36}))?\]\]/;
// `[[` then the query typed so far, up to the caret.
const TRIGGER_RE = /\[\[([^[\]\n]*)$/;

const noteLinkSuggestionKey = new PluginKey('noteLinkSuggestion');

export function noteLinkContent(attrs: NoteLinkAttrs) {
  return { type: 'noteLink', attrs: { id: attrs.id, label: cleanLinkLabel(attrs.label) || 'Untitled' } };
}

/** Inserts a link to `note` over `range`, followed by a space so typing carries on. */
function insertLink(editor: Editor, range: Range, note: Pick<PublicNote, 'id' | 'title'>) {
  editor
    .chain()
    .focus()
    .insertContentAt(range, [noteLinkContent({ id: note.id, label: note.title }), { type: 'text', text: ' ' }])
    .run();
}

function findTrigger({ $position }: { $position: ResolvedPos }): SuggestionMatch {
  const before = $position.parent.textBetween(0, $position.parentOffset, undefined, '￼');
  const match = TRIGGER_RE.exec(before);
  if (!match) return null;
  const from = $position.pos - match[0].length;
  return { range: { from, to: $position.pos }, query: match[1], text: match[0] };
}

/**
 * Obsidian-style note links, stored in markdown as `[[Label|noteId]]`. Plain
 * `[[Title]]` (as an agent might write) also parses and resolves by title.
 * Typing `[[` opens a picker over the workspace's notes.
 */
export const NoteLink = Node.create<NoteLinkOptions>({
  name: 'noteLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { workspaceId: '', noteId: '', createSubnote: null };
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-note-id'),
        renderHTML: (attrs: { id?: string | null }) => (attrs.id ? { 'data-note-id': attrs.id } : {}),
      },
      label: {
        default: '',
        parseHTML: (element: HTMLElement) => element.textContent ?? '',
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-note-link]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-note-link': '' }), String(node.attrs.label)];
  },

  renderText({ node }) {
    return String(node.attrs.label);
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoteLinkView, { as: 'span' });
  },

  markdownTokenizer: {
    name: 'noteLink',
    level: 'inline',
    start: (src) => src.indexOf('[['),
    tokenize(src) {
      const match = LINK_RE.exec(src);
      if (!match) return undefined;
      return { type: 'noteLink', raw: match[0], label: match[1].trim(), id: match[2]?.toLowerCase() ?? null };
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode('noteLink', { id: token.id ?? null, label: String(token.label ?? '') });
  },

  renderMarkdown(node) {
    const label = cleanLinkLabel(String(node.attrs?.label ?? '')) || 'Untitled';
    return node.attrs?.id ? `[[${label}|${node.attrs.id}]]` : `[[${label}]]`;
  },

  addProseMirrorPlugins() {
    const { workspaceId, noteId, createSubnote } = this.options;
    return [
      Suggestion<NoteLinkItem, NoteLinkItem>({
        pluginKey: noteLinkSuggestionKey,
        editor: this.editor,
        char: '[[',
        allowSpaces: true,
        allowedPrefixes: null,
        findSuggestionMatch: findTrigger,
        allow: ({ editor, range }) => {
          const $from = editor.state.doc.resolve(range.from);
          return editor.isEditable && !$from.parent.type.spec.code;
        },
        items: ({ query }) =>
          noteLinkItems(
            useNoteStore.getState().byWorkspace[workspaceId] ?? [],
            query,
            noteId,
            createSubnote !== null
          ),
        command: ({ editor, range, props: item }) => {
          if (item.kind === 'note') {
            insertLink(editor, range, item.note);
            return;
          }
          if (!createSubnote) return;
          void createSubnote(item.title)
            .then((note) => insertLink(editor, range, note))
            .catch((error: unknown) => {
              window.alert(error instanceof Error ? error.message : 'Could not create sub-note');
            });
        },
        render: () => {
          let host: HTMLDivElement | null = null;
          let root: Root | null = null;
          let unmount: (() => void) | null = null;
          const picker = createRef<NoteLinkPickerHandle>();
          const close = () => {
            unmount?.();
            root?.unmount();
            host?.remove();
            host = null;
            root = null;
            unmount = null;
            release(close);
          };
          const draw = (props: { items: NoteLinkItem[]; command: (item: NoteLinkItem) => void }) => {
            root?.render(<NoteLinkPicker ref={picker} items={props.items} onPick={props.command} />);
          };
          return {
            onStart: (props) => {
              host = document.createElement('div');
              host.className = 'note-col-menu note-link-menu';
              root = createRoot(host);
              exclusive(close);
              draw(props);
              unmount = props.mount(host);
            },
            onUpdate: draw,
            onKeyDown: ({ event }) => {
              if (event.key === 'Escape') {
                close();
                return true;
              }
              return picker.current?.onKeyDown(event) ?? false;
            },
            onExit: close,
          };
        },
      }),
    ];
  },
});
