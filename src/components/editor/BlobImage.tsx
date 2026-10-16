import { useEffect, useState } from 'react';
import { fetchBlob } from '../../api/blobs';
import { useAuthStore } from '../../stores/StoresIndex';
import { ImageLightbox } from './ImageLightbox';

type ViewerProps = {
  /** Clicking the image opens the full-screen viewer. */
  zoomable?: boolean;
  /** Opens the viewer from outside (e.g. an expand button); pair with onViewerClose. */
  viewerOpen?: boolean;
  onViewerClose?: () => void;
};

/** Workspace blobs need the bearer token, so images load through fetch + an object URL. */
export function BlobImage({
  src,
  alt,
  className = 'md-blob-image',
  zoomable,
  viewerOpen,
  onViewerClose,
}: { src: string; alt: string; className?: string } & ViewerProps) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [loaded, setLoaded] = useState<{ src: string; url: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let url: string | null = null;
    let cancelled = false;
    fetchBlob(accessToken, src).then(
      (blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setLoaded({ src, url });
      },
      () => !cancelled && setFailed(src)
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [accessToken, src]);

  if (failed === src) return <span className="muted">[Image unavailable: {alt}]</span>;
  if (loaded?.src !== src) return <span className="md-blob-loading">Loading…</span>;
  return (
    <ViewableImage
      src={loaded.url}
      alt={alt}
      className={className}
      zoomable={zoomable}
      viewerOpen={viewerOpen}
      onViewerClose={onViewerClose}
    />
  );
}

/** An <img> that can open in the full-screen viewer; use for images that load without auth. */
export function ViewableImage({
  src,
  alt,
  className,
  zoomable,
  viewerOpen,
  onViewerClose,
}: { src: string; alt: string; className?: string } & ViewerProps) {
  const [open, setOpen] = useState(false);
  const showing = viewerOpen ?? open;
  const close = () => {
    setOpen(false);
    onViewerClose?.();
  };
  return (
    <>
      {zoomable ? (
        <button type="button" className="md-image-button" aria-label={`View ${alt || 'image'} larger`} onClick={() => setOpen(true)}>
          <img className={className} src={src} alt={alt} />
        </button>
      ) : (
        <img className={className} src={src} alt={alt} />
      )}
      {showing ? <ImageLightbox src={src} alt={alt} onClose={close} /> : null}
    </>
  );
}
