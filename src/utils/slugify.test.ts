import { describe, expect, it } from 'vitest';
import {
  hashMarkdown,
  markdownSearchText,
  markdownSlugFromSegment,
  parseDocsPath,
  slugify,
} from './slugify';

describe('slugify', () => {
  it('normalizes titles into path slugs', () => {
    expect(slugify('API Auth')).toBe('api-auth');
    expect(slugify('  Hello, World!  ')).toBe('hello-world');
    expect(slugify('')).toBe('untitled');
  });

  it('parses docs paths and markdown segments', () => {
    expect(parseDocsPath('docs/api/auth.md')).toEqual(['docs', 'api', 'auth.md']);
    expect(parseDocsPath('/a//b/../c')).toEqual(['a', 'b', 'c']);
    expect(markdownSlugFromSegment('Auth.md')).toBe('auth');
  });

  it('hashes markdown and strips fences for search', () => {
    expect(hashMarkdown('')).toHaveLength(64);
    expect(markdownSearchText('# Title\n```js\nsecret()\n```\nhello')).toBe('# Title hello');
  });
});
