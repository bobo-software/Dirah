import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { PublicNote } from '../../api/client';
import { useNoteStore } from '../../stores/StoresIndex';
import { NoteGlyph } from './NoteTree';
import { buildNoteTree, type NoteNode } from './noteTreeModel';
import { useNoteActions } from './useNoteActions';
import { Button } from '../buttons/Button';

export function NotesBrowser({ workspaceId }: { workspaceId: string }) {
  const loaded = useNoteStore((state) => state.loadedWorkspaces.has(workspaceId));
  const { notes, busy, message, create } = useNoteActions(workspaceId);

  // The index lists top-level notes only, pinned first; sub-notes live in the sidebar tree.
  const roots = useMemo(
    () =>
      buildNoteTree(notes).sort(
        (a, b) => Number(Boolean(b.note.pinnedAt)) - Number(Boolean(a.note.pinnedAt))
      ),
    [notes]
  );

  return (
    <section className="notes-home" aria-label="Notes">
      <div className="notes-home-head">
        <p className="muted">Your notes are private unless you share them.</p>
        <Button type="button" onClick={() => void create()} disabled={busy}>
          New note
        </Button>
      </div>
      {message ? (
        <p className="error" role="alert">
          {message}
        </p>
      ) : null}
      {!loaded ? (
        <p className="muted">Loading notes…</p>
      ) : roots.length === 0 ? (
        <p className="muted home-empty-state">No notes yet.</p>
      ) : (
        <ul className="notes-index">
          {roots.map((node) => (
            <NoteRow key={node.note.id} node={node} workspaceId={workspaceId} />
          ))}
        </ul>
      )}
    </section>
  );
}

function countDescendants(node: NoteNode): number {
  return node.children.reduce((total, child) => total + 1 + countDescendants(child), 0);
}

function formatNoteDate(iso: string): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function NoteRow({ node, workspaceId }: { node: NoteNode; workspaceId: string }) {
  const note: PublicNote = node.note;
  const subNotes = countDescendants(node);
  const pinned = Boolean(note.pinnedAt);

  return (
    <li>
      <Link
        to={`/w/${workspaceId}/n/${note.id}`}
        className={pinned ? 'note-slip is-pinned' : 'note-slip'}
      >
        <span className="note-slip-mark" aria-hidden="true" />
        <span className="note-slip-body">
          <h3 className="note-slip-title">
            <NoteGlyph note={note} />
            <span className="note-slip-name">{note.title || 'Untitled'}</span>
            {pinned ? <span className="visually-hidden">Pinned</span> : null}
          </h3>
          {note.excerpt ? <span className="note-slip-excerpt">{note.excerpt}</span> : null}
          {note.kind === 'kanban' || subNotes > 0 ? (
            <span className="note-slip-detail">
              {note.kind === 'kanban' ? <span>Board</span> : null}
              {subNotes > 0 ? (
                <span>
                  {subNotes} sub-note{subNotes === 1 ? '' : 's'}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
        <span className="note-slip-meta">
          <time dateTime={note.updatedAt}>{formatNoteDate(note.updatedAt)}</time>
          <span>{note.visibility === 'workspace' ? 'Workspace' : 'Private'}</span>
        </span>
      </Link>
    </li>
  );
}
