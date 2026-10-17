import { useState } from 'react';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { isBlobPath } from '../../api/blobs';
import { BlobImage, ViewableImage } from './BlobImage';
import { Button } from '../buttons/Button';

export function BlobImageView({ node, selected, editor, deleteNode }: ReactNodeViewProps) {
  const src = String(node.attrs.src ?? '');
  const alt = String(node.attrs.alt ?? '');
  const [viewing, setViewing] = useState(false);
  const viewer = { viewerOpen: viewing, onViewerClose: () => setViewing(false) };
  return (
    <NodeViewWrapper as="span" className={`rich-image${selected ? ' is-selected' : ''}`} data-drag-handle="">
      <span onDoubleClick={() => setViewing(true)}>
        {isBlobPath(src) ? (
          <BlobImage src={src} alt={alt} className="rich-image-img" {...viewer} />
        ) : (
          <ViewableImage src={src} alt={alt} className="rich-image-img" {...viewer} />
        )}
      </span>
      <span className="rich-image-actions" contentEditable={false}>
        <Button variant="plain"
          type="button"
          className="rich-image-action"
          aria-label={`View ${alt || 'image'} larger`}
          title="View larger"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setViewing(true)}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
          </svg>
        </Button>
        {editor.isEditable ? (
          <Button variant="plain"
            type="button"
            className="rich-image-action"
            aria-label={`Remove ${alt || 'image'}`}
            title="Remove"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => deleteNode()}
          >
            ×
          </Button>
        ) : null}
      </span>
    </NodeViewWrapper>
  );
}
