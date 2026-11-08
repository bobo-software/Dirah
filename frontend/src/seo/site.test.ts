import { describe, expect, it } from 'vitest';
import { excerptFromMarkdown } from './site';

describe('excerptFromMarkdown', () => {
  it('keeps the words and drops the markup', () => {
    const text = excerptFromMarkdown('# Title\n\nSome **bold** text and a [link](https://example.com).');
    expect(text).toBe('Title Some bold text and a link.');
  });

  it('cuts at a word boundary and marks the cut', () => {
    const text = excerptFromMarkdown('one two three four five six seven', 12);
    expect(text.endsWith('…')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(13);
  });

  it('leaves short text alone', () => {
    expect(excerptFromMarkdown('short')).toBe('short');
  });
});
