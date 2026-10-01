import { createHash } from 'node:crypto';

const MAX_SLUG = 80;

export function slugify(title: string): string {
  const s = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, '');
  return s || 'untitled';
}

export function hashMarkdown(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function markdownSearchText(content: string): string {
  return content.replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim();
}

const MAX_EXCERPT = 180;

/** Plain-text preview for a card/list UI. Input is normally `pages.search_text`. */
export function excerptFromSearchText(text: string, maxLen = MAX_EXCERPT): string {
  const plain = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~>#]+/g, ' ')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen).trimEnd()}…`;
}

/** Markers used with ts_headline StartSel/StopSel, then stripped so snippets stay plain text. */
export const SEARCH_HEADLINE_START = '<<hl>>';
export const SEARCH_HEADLINE_STOP = '<</hl>>';

export function normalizeDocsSearchQuery(q: string): { raw: string; fts: string; compact: string } | null {
  const raw = q.replace(/[%_]/g, '').slice(0, 100).trim();
  if (!raw) return null;
  const fts = raw.replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim() || raw;
  const compact = raw.replace(/[-_/\s]+/g, '');
  return { raw, fts, compact };
}

export function stripSearchHeadlineMarkers(snippet: string): string {
  return snippet.split(SEARCH_HEADLINE_START).join('').split(SEARCH_HEADLINE_STOP).join('');
}

export function parseDocsPath(pathRaw: string): string[] {
  return pathRaw
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part && part !== '.' && part !== '..');
}

export function markdownSlugFromSegment(segment: string): string {
  const trimmed = segment.replace(/\.md$/i, '');
  return slugify(trimmed);
}
