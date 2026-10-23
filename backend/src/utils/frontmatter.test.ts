import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from './frontmatter';

describe('parseFrontmatter', () => {
  it('returns empty data when there is no frontmatter block', () => {
    const result = parseFrontmatter('# Hello\n\nBody text.');
    expect(result.data).toEqual({});
    expect(result.body).toBe('# Hello\n\nBody text.');
  });

  it('parses a scalar field', () => {
    const result = parseFrontmatter('---\nwhen: adding a new API endpoint\n---\n# Hello');
    expect(result.data.when).toBe('adding a new API endpoint');
    expect(result.body).toBe('# Hello');
  });

  it('parses a list field', () => {
    const result = parseFrontmatter('---\ntopics: [rest, conventions]\n---\nBody');
    expect(result.data.topics).toEqual(['rest', 'conventions']);
  });

  it('parses multiple fields including repos', () => {
    const result = parseFrontmatter(
      '---\ntopics: [rest]\nrepos: [schoolos-backend]\nwhen: adding routes\n---\nBody'
    );
    expect(result.data).toEqual({
      topics: ['rest'],
      repos: ['schoolos-backend'],
      when: 'adding routes',
    });
  });

  it('does not throw on an unterminated frontmatter block and treats it as body', () => {
    const content = '---\nwhen: adding routes\n\n# No closing fence';
    const result = parseFrontmatter(content);
    expect(result.data).toEqual({});
    expect(result.body).toBe(content);
  });
});
