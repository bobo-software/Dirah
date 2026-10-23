import type { PublicNote } from '../../../api/client';
import { breadcrumbs } from '../noteTreeModel';

export type NoteLinkItem =
  | { kind: 'note'; note: PublicNote; trail: string }
  | { kind: 'create'; title: string };

const MAX_RESULTS = 8;

/** Plain-text label for a `[[label|id]]` link; `|`, `[` and `]` would end it early. */
export function cleanLinkLabel(raw: string): string {
  return raw.replace(/[|[\]\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function rank(title: string, query: string): number {
  if (!query) return 2;
  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  if (title.split(/\s+/).some((word) => word.startsWith(query))) return 2;
  return title.includes(query) ? 3 : -1;
}

/**
 * Notes matching `query` for the link picker, best match first, ending with a
 * "create sub-note" row when no title matches exactly.
 */
export function noteLinkItems(
  notes: PublicNote[],
  query: string,
  excludeId: string | null,
  canCreate: boolean
): NoteLinkItem[] {
  const needle = query.trim().toLowerCase();
  const ranked = notes
    .filter((note) => note.id !== excludeId && !note.deletedAt)
    .map((note) => ({ note, score: rank(note.title.toLowerCase(), needle) }))
    .filter((entry) => entry.score >= 0)
    .sort(
      (a, b) =>
        a.score - b.score ||
        (needle ? a.note.title.length - b.note.title.length : 0) ||
        b.note.updatedAt.localeCompare(a.note.updatedAt)
    )
    .slice(0, MAX_RESULTS);
  const items: NoteLinkItem[] = ranked.map(({ note }) => ({
    kind: 'note',
    note,
    trail: breadcrumbs(notes, note)
      .slice(0, -1)
      .map((item) => item.title)
      .join(' / '),
  }));
  const title = cleanLinkLabel(query);
  if (canCreate && title && !ranked.some(({ note }) => note.title.toLowerCase() === needle)) {
    items.push({ kind: 'create', title });
  }
  return items;
}
