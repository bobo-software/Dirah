import type { MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { EMPTY_NOTES, useNoteStore } from '../../../stores/StoresIndex';
import { NoteGlyph } from '../NoteTree';
import type { NoteLinkOptions } from './noteLink';

export function NoteLinkView({ node, extension, selected }: ReactNodeViewProps) {
  const { workspaceId } = extension.options as NoteLinkOptions;
  const id = node.attrs.id as string | null;
  const label = String(node.attrs.label);
  const navigate = useNavigate();
  const target = useNoteStore((state) => {
    const notes = state.byWorkspace[workspaceId] ?? EMPTY_NOTES;
    if (id) return notes.find((note) => note.id === id);
    const title = label.trim().toLowerCase();
    return notes.find((note) => !note.deletedAt && note.title.trim().toLowerCase() === title);
  });
  const missing = !target || Boolean(target.deletedAt);
  const href = target ? `/w/${workspaceId}/n/${target.id}` : undefined;

  function open(event: MouseEvent) {
    if (!href) return;
    event.preventDefault();
    if (event.metaKey || event.ctrlKey) {
      window.open(href, '_blank', 'noopener');
      return;
    }
    navigate(href);
  }

  return (
    <NodeViewWrapper
      as="span"
      className={`note-link${missing ? ' note-link--missing' : ''}${selected ? ' is-selected' : ''}`}
      title={missing ? 'This note is unavailable' : target.title === label ? undefined : target.title}
      data-note-link=""
    >
      <a href={href} onClick={open} draggable={false} contentEditable={false}>
        {target ? <NoteGlyph note={target} /> : null}
        <span className="note-link-label">{label}</span>
      </a>
    </NodeViewWrapper>
  );
}
