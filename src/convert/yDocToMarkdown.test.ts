import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { ENCRYPTED_PAGE_NOTICE, planParentIds, yDocToMarkdown } from './yDocToMarkdown';

function setBlock(
  blocks: Y.Map<unknown>,
  id: string,
  flavour: string,
  props: Record<string, unknown>,
  children: string[] = []
): void {
  const block = new Y.Map();
  block.set('sys:id', id);
  block.set('sys:flavour', flavour);
  const kids = new Y.Array();
  kids.push(children);
  block.set('sys:children', kids);
  for (const [key, value] of Object.entries(props)) {
    block.set(`prop:${key}`, value);
  }
  blocks.set(id, block);
}

describe('yDocToMarkdown', () => {
  it('walks headings, lists, and code', () => {
    const doc = new Y.Doc();
    const blocks = doc.getMap('blocks');
    const title = new Y.Text();
    title.insert(0, 'Guide');
    const heading = new Y.Text();
    heading.insert(0, 'Install');
    const para = new Y.Text();
    para.insert(0, 'Run npm install.');
    const item = new Y.Text();
    item.insert(0, 'clone');
    const code = new Y.Text();
    code.insert(0, 'npm i');

    setBlock(blocks, 'page', 'affine:page', { title }, ['note', 'surface']);
    setBlock(blocks, 'note', 'affine:note', {}, ['h', 'p', 'l', 'c']);
    setBlock(blocks, 'surface', 'affine:surface', {});
    setBlock(blocks, 'h', 'affine:paragraph', { text: heading, type: 'h2' });
    setBlock(blocks, 'p', 'affine:paragraph', { text: para, type: 'text' });
    setBlock(blocks, 'l', 'affine:list', { text: item, type: 'bulleted' });
    setBlock(blocks, 'c', 'affine:code', { text: code, language: 'bash' });

    const md = yDocToMarkdown(doc, { fallbackTitle: 'Guide' });
    expect(md).toContain('# Guide');
    expect(md).toContain('## Install');
    expect(md).toContain('Run npm install.');
    expect(md).toContain('- clone');
    expect(md).toContain('```bash');
    expect(md).toContain('npm i');
    expect(md).not.toContain('affine:surface');
  });

  it('emits image blob urls', () => {
    const doc = new Y.Doc();
    const blocks = doc.getMap('blocks');
    setBlock(blocks, 'page', 'affine:page', { title: 'Pics' }, ['note']);
    setBlock(blocks, 'note', 'affine:note', {}, ['img']);
    setBlock(blocks, 'img', 'affine:image', { sourceId: 'blob-abc', caption: 'Logo' });
    expect(yDocToMarkdown(doc, { workspaceId: 'ws-1' })).toContain(
      '![Logo](/api/workspaces/ws-1/blobs/blob-abc)'
    );
  });

  it('plans parents that have children', () => {
    const parents = planParentIds([
      { id: 'a', parentId: null },
      { id: 'b', parentId: 'a' },
      { id: 'c', parentId: null },
    ]);
    expect([...parents]).toEqual(['a']);
  });
});

describe('encrypted notice', () => {
  it('is a non-empty markdown paragraph', () => {
    expect(ENCRYPTED_PAGE_NOTICE).toContain('encrypted');
  });
});
