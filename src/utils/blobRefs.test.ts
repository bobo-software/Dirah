import { describe, expect, it } from 'vitest';
import { blobIdsInMarkdown, isValidBlobId } from './blobRefs';

describe('blob references', () => {
  it('finds each linked blob once, in order', () => {
    const markdown = [
      'Intro ![a](/api/blobs/abc-1) and a [file](/api/blobs/def.2)',
      '![again](/api/blobs/abc-1)',
      'Not a blob: /api/pages/xyz',
    ].join('\n\n');
    expect(blobIdsInMarkdown(markdown)).toEqual(['abc-1', 'def.2']);
    expect(blobIdsInMarkdown('no images here')).toEqual([]);
  });

  it('accepts only safe ids', () => {
    expect(isValidBlobId('6c38766a-c777-439a-8bf4-8f92cff4bbad')).toBe(true);
    expect(isValidBlobId('../escape')).toBe(false);
    expect(isValidBlobId('a/b')).toBe(false);
    expect(isValidBlobId('')).toBe(false);
    expect(isValidBlobId('x'.repeat(129))).toBe(false);
  });
});
