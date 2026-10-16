import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { BlobImageView } from './BlobImageView';

/**
 * An inline image stored in markdown as `![alt](src)`. Workspace files
 * (`/api/blobs/:id`) need the bearer token, so the view loads them through fetch.
 */
export const BlobImageNode = Node.create({
  name: 'blobImage',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'img[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)];
  },

  renderText({ node }) {
    return String(node.attrs.alt || 'image');
  },

  addNodeView() {
    return ReactNodeViewRenderer(BlobImageView, { as: 'span' });
  },

  markdownTokenName: 'image',

  parseMarkdown(token, helpers) {
    return helpers.createNode('blobImage', { src: String(token.href ?? ''), alt: String(token.text ?? '') });
  },

  renderMarkdown(node) {
    const alt = String(node.attrs?.alt ?? '').replace(/[[\]]/g, '');
    return `![${alt}](${String(node.attrs?.src ?? '')})`;
  },
});
