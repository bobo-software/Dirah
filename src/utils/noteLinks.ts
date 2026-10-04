export interface NoteLinkRef {
  label: string;
  /** Present for `[[Label|id]]`; title-only `[[Title]]` links resolve by title. */
  id?: string;
}

const FENCE_RE = /^\s*(```|~~~)/;
const INLINE_CODE_RE = /`[^`\n]*`/g;
const LINK_RE = /\[\[([^[\]|\n]+?)(?:\|([0-9a-fA-F-]{36}))?\]\]/g;

/**
 * Lines of `markdown` that can hold links: fenced code blocks are dropped and
 * inline code spans blanked, so `[[x]]` inside code is never a link.
 */
function linkableLines(markdown: string): string[] {
  const lines: string[] = [];
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    lines.push(line.replace(INLINE_CODE_RE, (code) => ' '.repeat(code.length)));
  }
  return lines;
}

/** Every `[[Label|id]]` / `[[Title]]` link in a note, in document order. */
export function extractNoteLinks(markdown: string): NoteLinkRef[] {
  const links: NoteLinkRef[] = [];
  for (const line of linkableLines(markdown)) {
    for (const match of line.matchAll(LINK_RE)) {
      const label = match[1].trim();
      if (!label && !match[2]) continue;
      links.push(match[2] ? { label, id: match[2].toLowerCase() } : { label });
    }
  }
  return links;
}

/** `[[Label|id]]` for a note; `|`, `[`, `]` and newlines in the label would end it early. */
export function formatNoteLink(label: string, id: string): string {
  const clean = label.replace(/[|[\]\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled';
  return `[[${clean}|${id}]]`;
}

/** Replaces links with their labels so search text and excerpts read naturally. */
export function noteLinksToLabels(markdown: string): string {
  return markdown.replace(LINK_RE, (_all, label: string) => label.trim());
}

const MAX_CONTEXT = 160;

/**
 * The first line of `markdown` that links to `targetId` (or, for title-only
 * links, to `targetTitle`), as plain text for a backlinks list.
 */
export function noteLinkContext(markdown: string, targetId: string, targetTitle: string): string {
  const title = targetTitle.trim().toLowerCase();
  for (const line of linkableLines(markdown)) {
    const hit = [...line.matchAll(LINK_RE)].some((match) =>
      match[2] ? match[2].toLowerCase() === targetId : match[1].trim().toLowerCase() === title
    );
    if (!hit) continue;
    const plain = noteLinksToLabels(line)
      .replace(/^\s*(?:#{1,6}|[-*+]|\d+[.)]|>)\s+(?:\[[ xX]\]\s*)?/, '')
      .replace(/\s+/g, ' ')
      .trim();
    return plain.length <= MAX_CONTEXT ? plain : `${plain.slice(0, MAX_CONTEXT).trimEnd()}…`;
  }
  return '';
}
