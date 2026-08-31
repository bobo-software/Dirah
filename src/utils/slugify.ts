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
