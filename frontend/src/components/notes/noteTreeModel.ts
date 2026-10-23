import type { PublicNote } from '../../api/client';

export type NoteNode = {
  note: PublicNote;
  children: NoteNode[];
};

export type DropZone = 'before' | 'inside' | 'after';

/** `note` and its ancestors, root first. */
export function breadcrumbs(notes: PublicNote[], note: PublicNote | undefined): PublicNote[] {
  const byId = new Map(notes.map((item) => [item.id, item]));
  const trail: PublicNote[] = [];
  const seen = new Set<string>();
  let cursor = note;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    trail.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return trail;
}

export function buildNoteTree(notes: PublicNote[]): NoteNode[] {
  const ids = new Set(notes.map((note) => note.id));
  const byParent = new Map<string | null, PublicNote[]>();
  for (const note of notes) {
    const parentId = note.parentId && ids.has(note.parentId) ? note.parentId : null;
    const list = byParent.get(parentId) ?? [];
    list.push(note);
    byParent.set(parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
  }
  const nest = (parentId: string | null): NoteNode[] =>
    (byParent.get(parentId) ?? []).map((note) => ({ note, children: nest(note.id) }));
  return nest(null);
}
