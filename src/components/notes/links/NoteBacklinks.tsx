import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getNoteBacklinks, type NoteBacklink } from '../../../api/notes';
import { useAuthStore } from '../../../stores/StoresIndex';
import { NoteGlyph } from '../NoteTree';

/** "Linked from" list under a note: other notes the viewer can see that link here. */
export function NoteBacklinks({ workspaceId, noteId }: { workspaceId: string; noteId: string }) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [backlinks, setBacklinks] = useState<NoteBacklink[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const load = () => {
      getNoteBacklinks(accessToken, noteId)
        .then((next) => {
          if (!cancelled) setBacklinks(next);
        })
        .catch(() => undefined);
    };
    load();
    // Links are written from other notes, so refresh when the user comes back.
    window.addEventListener('focus', load);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', load);
    };
  }, [accessToken, noteId]);

  if (backlinks.length === 0) return null;

  return (
    <section className="note-backlinks" aria-label="Linked from">
      <h2>Linked from ({backlinks.length})</h2>
      <ul>
        {backlinks.map(({ note, context }) => (
          <li key={note.id}>
            <Link to={`/w/${workspaceId}/n/${note.id}`}>
              <NoteGlyph note={note} />
              <span className="note-backlink-title">{note.title}</span>
            </Link>
            {context ? <p>{context}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
