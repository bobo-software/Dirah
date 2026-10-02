import type { PublicNote } from '../../api/client';

export type NoteNode = {
  note: PublicNote;
  children: NoteNode[];
};

export type DropZone = 'before' | 'inside' | 'after';

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
