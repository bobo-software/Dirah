import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { extractPlainText } from './extractPlainText';

describe('extractPlainText', () => {
  it('collects Y.Text under blocks and skips sys keys', () => {
    const doc = new Y.Doc();
    const blocks = doc.getMap('blocks');
    const block = new Y.Map();
    const text = new Y.Text();
    text.insert(0, 'uniquebodytoken xyzzyplugh');
    block.set('sys:flavour', 'affine:paragraph');
    block.set('sys:id', 'not-in-index');
    block.set('prop:text', text);
    blocks.set('b1', block);

    const extracted = extractPlainText(Y, doc);
    expect(extracted).toContain('uniquebodytoken');
    expect(extracted).toContain('xyzzyplugh');
    expect(extracted).not.toContain('affine:paragraph');
    expect(extracted).not.toContain('not-in-index');
  });

  it('returns empty string when there are no blocks', () => {
    expect(extractPlainText(Y, new Y.Doc())).toBe('');
  });
});
