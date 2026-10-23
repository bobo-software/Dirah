import { useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchBlob, isBlobPath } from '../../api/blobs';
import { BlobImage, ViewableImage } from '../editor/BlobImage';
import { useAuthStore } from '../../stores/StoresIndex';
import { Button } from '../buttons/Button';

function BlobLink({ href, children }: { href: string; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);

  async function open() {
    const accessToken = useAuthStore.getState().accessToken;
    if (!accessToken || busy) return;
    setBusy(true);
    try {
      const url = URL.createObjectURL(await fetchBlob(accessToken, href));
      window.open(url, '_blank', 'noopener');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="plain" type="button" className="ticket-attachment-link" onClick={() => void open()} disabled={busy}>
      {children}
    </Button>
  );
}

const components: Components = {
  img: ({ src, alt }) =>
    typeof src === 'string' && isBlobPath(src) ? (
      <BlobImage src={src} alt={alt ?? ''} zoomable />
    ) : typeof src === 'string' ? (
      <ViewableImage src={src} alt={alt ?? ''} className="md-blob-image" zoomable />
    ) : null,
  a: ({ href, children }) =>
    isBlobPath(href) ? (
      <BlobLink href={href}>{children}</BlobLink>
    ) : (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ),
};

export function TicketMarkdown({ children }: { children: string }) {
  return (
    <div className="markdown-preview ticket-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
