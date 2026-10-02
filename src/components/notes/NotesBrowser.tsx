import { type CSSProperties, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { PublicNote } from '../../api/client';
import { useNoteStore } from '../../stores/StoresIndex';
import { categoryHue } from '../docs/categoryColor';
import { NoteGlyph } from './NoteTree';
import { buildNoteTree, type NoteNode } from './noteTreeModel';
import { useNoteActions } from './useNoteActions';

export function NotesBrowser({ workspaceId }: { workspaceId: string }) {
  const loaded = useNoteStore((state) => state.loadedWorkspaces.has(workspaceId));
  const { notes, busy, message, create } = useNoteActions(workspaceId);

  // Cards show the top-level notes only, in tree order with pinned first; sub-notes live in the sidebar tree.
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
        <button type="button" onClick={() => void create()} disabled={busy}>
          New note
        </button>
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
        <div className="docs-grid">
          {roots.map((node) => (
            <NoteCard key={node.note.id} node={node} workspaceId={workspaceId} />
          ))}
        </div>
      )}
    </section>
  );
}

function countDescendants(node: NoteNode): number {
  return node.children.reduce((total, child) => total + 1 + countDescendants(child), 0);
}

function NoteCard({ node, workspaceId }: { node: NoteNode; workspaceId: string }) {
  const note: PublicNote = node.note;
  const subNotes = countDescendants(node);
  const updated = new Date(note.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const cardStyle = { '--card-hue': categoryHue(note.id) } as CSSProperties;

  return (
    <div className="doc-card" style={cardStyle}>
      <Link to={`/w/${workspaceId}/n/${note.id}`} className="doc-card-link">
        <div className="doc-card-meta">
          <span>{updated}</span>
          {subNotes > 0 ? (
            <span className="doc-card-location">
              {subNotes} sub-note{subNotes === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        <h3 className="doc-card-title note-card-title">
          <NoteGlyph note={note} />
          {note.title}
        </h3>
        {note.excerpt ? <p className="doc-card-excerpt">{note.excerpt}</p> : null}
      </Link>
      <div className="doc-card-foot">
        <span className="doc-card-status">{note.visibility === 'workspace' ? 'Workspace' : 'Private'}</span>
        {note.pinnedAt ? (
          <span className="note-card-pin" aria-label="Pinned" title="Pinned">
            ★
          </span>
        ) : null}
      </div>
    </div>
  );
}
