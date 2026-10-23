import { useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import { BubbleMenu } from '@tiptap/react/menus';
import type { PublicNote } from '../../../api/client';
import { EMPTY_NOTES, useNoteStore } from '../../../stores/StoresIndex';
import { NoteLinkPicker, type NoteLinkPickerHandle } from './NoteLinkPicker';
import { noteLinkContent } from './noteLink';
import { cleanLinkLabel, noteLinkItems, type NoteLinkItem } from './noteLinkItems';
import { extractSelectionToSubnote, selectedText } from './extractToSubnote';
import { Button } from '../../buttons/Button';

const BLOCKED_PARENTS = new Set(['codeBlock', 'table']);

function selectionAllowed(state: EditorState): boolean {
  const { $from, $to, empty } = state.selection;
  if (empty || !state.doc.textBetween($from.pos, $to.pos, ' ', ' ').trim()) return false;
  for (const $pos of [$from, $to]) {
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if (BLOCKED_PARENTS.has($pos.node(depth).type.name)) return false;
    }
  }
  return true;
}

/**
 * Bubble menu over a text selection: move it into a new sub-note (leaving a
 * link behind), or turn it into a link to an existing note.
 */
export function NoteSelectionMenu({
  editor,
  workspaceId,
  noteId,
  createSubnote,
  onError,
}: {
  editor: Editor;
  workspaceId: string;
  noteId: string;
  createSubnote: (title: string) => Promise<PublicNote>;
  onError: (message: string) => void;
}) {
  const notes = useNoteStore((state) => state.byWorkspace[workspaceId] ?? EMPTY_NOTES);
  const saveContent = useNoteStore((state) => state.saveContent);
  const [mode, setMode] = useState<'actions' | 'link'>('actions');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const picker = useRef<NoteLinkPickerHandle>(null);

  function reset() {
    setMode('actions');
    setQuery('');
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      reset();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  function linkSelection(target: Pick<PublicNote, 'id' | 'title'>) {
    const label = cleanLinkLabel(selectedText(editor)) || target.title;
    editor.chain().focus().insertContent(noteLinkContent({ id: target.id, label })).run();
  }

  function onPick(item: NoteLinkItem) {
    if (item.kind === 'note') {
      linkSelection(item.note);
      reset();
      return;
    }
    void run(async () => linkSelection(await createSubnote(item.title)));
  }

  function startLink() {
    setQuery(cleanLinkLabel(selectedText(editor)));
    setMode('link');
  }

  const items = mode === 'link' ? noteLinkItems(notes, query, noteId, true) : [];

  return (
    <BubbleMenu
      editor={editor}
      className="note-bubble-menu"
      options={{ placement: 'top', offset: 8, onHide: reset }}
      shouldShow={({ editor: current, element, view, state }) =>
        current.isEditable &&
        (view.hasFocus() || element.contains(document.activeElement)) &&
        selectionAllowed(state)
      }
    >
      {mode === 'actions' ? (
        <div className="note-bubble-actions" role="toolbar" aria-label="Selection">
          <Button
            type="button"
            disabled={busy}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void run(() => extractSelectionToSubnote(editor, createSubnote, saveContent))}
            title="Move the selection into a new sub-note and link to it"
          >
            {busy ? 'Creating…' : 'Turn into sub-note'}
          </Button>
          <Button
            type="button"
            disabled={busy}
            onMouseDown={(event) => event.preventDefault()}
            onClick={startLink}
            title="Link the selection to another note"
          >
            Link to note
          </Button>
        </div>
      ) : (
        <div className="note-bubble-link">
          <input
            autoFocus
            className="note-bubble-search"
            placeholder="Find a note…"
            aria-label="Find a note to link"
            value={query}
            // Starts as the selected text; typing replaces it.
            onFocus={(event) => event.target.select()}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                reset();
                editor.commands.focus();
                return;
              }
              if (picker.current?.onKeyDown(event)) event.preventDefault();
            }}
          />
          <NoteLinkPicker ref={picker} items={items} onPick={onPick} busy={busy} />
        </div>
      )}
    </BubbleMenu>
  );
}
