import { describe, expect, it } from 'vitest';
import { extractNoteLinks, formatNoteLink, noteLinkContext, noteLinksToLabels } from './noteLinks';

const ID = '3f2a9c1e-1b2c-4d5e-8f90-a1b2c3d4e5f6';

describe('extractNoteLinks', () => {
  it('reads id links and title-only links in order', () => {
    expect(extractNoteLinks(`See [[Roadmap|${ID}]] and [[Ideas]].`)).toEqual([
      { label: 'Roadmap', id: ID },
      { label: 'Ideas' },
    ]);
  });

  it('lowercases ids', () => {
    expect(extractNoteLinks(`[[A|${ID.toUpperCase()}]]`)).toEqual([{ label: 'A', id: ID }]);
  });

  it('ignores links in fenced and inline code', () => {
    const md = ['```', `[[Hidden|${ID}]]`, '```', 'Use `[[Nope]]` but [[Yes]]', '~~~', '[[Also hidden]]', '~~~'].join('\n');
    expect(extractNoteLinks(md)).toEqual([{ label: 'Yes' }]);
  });

  it('ignores empty and multi-line brackets', () => {
    expect(extractNoteLinks('[[]] [[a\nb]] [[ ]]')).toEqual([]);
  });
});

describe('noteLinksToLabels', () => {
  it('swaps links for their labels', () => {
    expect(noteLinksToLabels(`Go to [[Roadmap|${ID}]] or [[Ideas]]`)).toBe('Go to Roadmap or Ideas');
  });
});

describe('noteLinkContext', () => {
  it('returns the linking line as plain text', () => {
    const md = `# Title\n\n- [ ] Check [[Roadmap|${ID}]] today\nother`;
    expect(noteLinkContext(md, ID, 'Whatever')).toBe('Check Roadmap today');
  });

  it('matches title-only links by title', () => {
    expect(noteLinkContext('x\n> see [[roadmap]]', ID, 'Roadmap')).toBe('see roadmap');
  });

  it('returns an empty string when nothing links', () => {
    expect(noteLinkContext('nothing', ID, 'Roadmap')).toBe('');
  });
});

describe('formatNoteLink', () => {
  it('writes a parseable link and cleans the label', () => {
    const link = formatNoteLink('Dune | [Part 1]\n', ID);
    expect(link).toBe(`[[Dune Part 1|${ID}]]`);
    expect(extractNoteLinks(link)).toEqual([{ label: 'Dune Part 1', id: ID }]);
    expect(formatNoteLink('  ', ID)).toBe(`[[Untitled|${ID}]]`);
  });
});
