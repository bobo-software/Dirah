import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../buttons/Button';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;
const STEP = 1.25;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/** A cleaned-up file name for downloads, keeping the extension the image already has. */
function downloadName(name: string, mime: string | null) {
  const base = name.trim() || 'image';
  if (/\.[a-z0-9]{2,5}$/i.test(base)) return base;
  const ext = mime?.split('/')[1]?.replace('jpeg', 'jpg').replace(/\+.*/, '');
  return ext ? `${base}.${ext}` : base;
}

/**
 * Full-screen image viewer: zoom (buttons, keys, ctrl/⌘ + wheel), drag to pan,
 * rotate, open in a new tab, download and copy. `src` should already be
 * loadable by an <img> (an object URL for workspace files).
 */
export function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [mime, setMime] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  });

  function zoomTo(next: number) {
    const value = clampZoom(next);
    setZoom(value);
    if (value <= 1) setOffset({ x: 0, y: 0 });
  }

  function reset() {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }

  useEffect(() => {
    dialogRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((res) => res.blob())
      .then((blob) => !cancelled && setMime(blob.type || null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
      } else if (event.key === '+' || event.key === '=') {
        setZoom((value) => clampZoom(value * STEP));
      } else if (event.key === '-') {
        setZoom((value) => {
          const next = clampZoom(value / STEP);
          if (next <= 1) setOffset({ x: 0, y: 0 });
          return next;
        });
      } else if (event.key === '0') {
        setZoom(1);
        setRotation(0);
        setOffset({ x: 0, y: 0 });
      } else if (event.key.toLowerCase() === 'r') {
        setRotation((value) => (value + 90) % 360);
      }
    }
    // Capture so Escape closes the viewer before any panel or modal underneath sees it.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  async function copy() {
    try {
      const blob = await (await fetch(src)).blob();
      const png =
        blob.type === 'image/png'
          ? blob
          : await new Promise<Blob>((resolve, reject) => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                canvas.getContext('2d')?.drawImage(img, 0, 0);
                canvas.toBlob((out) => (out ? resolve(out) : reject(new Error('encode'))), 'image/png');
              };
              img.onerror = () => reject(new Error('load'));
              img.src = src;
            });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      setNotice('Image copied');
    } catch {
      setNotice('Couldn’t copy this image');
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLImageElement>) {
    if (zoom <= 1) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, startX: offset.x, startY: offset.y };
    setDragging(true);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLImageElement>) {
    const start = drag.current;
    if (!start) return;
    setOffset({ x: start.startX + event.clientX - start.x, y: start.startY + event.clientY - start.y });
  }

  function endDrag() {
    drag.current = null;
    setDragging(false);
  }

  const zoomed = zoom > 1;

  return createPortal(
    <div
      ref={dialogRef}
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt ? `Image: ${alt}` : 'Image'}
      tabIndex={-1}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      onWheel={(event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        zoomTo(zoom * (event.deltaY < 0 ? STEP : 1 / STEP));
      }}
    >
      <div className="lightbox-bar" onMouseDown={(event) => event.stopPropagation()}>
        <span className="lightbox-title" title={alt}>
          {alt || 'Image'}
        </span>
        <div className="lightbox-tools" role="toolbar" aria-label="Image options">
          <Button variant="plain" type="button" className="lightbox-tool" aria-label="Zoom out" title="Zoom out (−)" onClick={() => zoomTo(zoom / STEP)} disabled={zoom <= MIN_ZOOM}>
            −
          </Button>
          <Button variant="plain" type="button" className="lightbox-tool lightbox-zoom" title="Reset (0)" onClick={reset}>
            {Math.round(zoom * 100)}%
          </Button>
          <Button variant="plain" type="button" className="lightbox-tool" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomTo(zoom * STEP)} disabled={zoom >= MAX_ZOOM}>
            +
          </Button>
          <span className="lightbox-divider" aria-hidden="true" />
          <Button variant="plain" type="button" className="lightbox-tool" aria-label="Rotate" title="Rotate (R)" onClick={() => setRotation((value) => (value + 90) % 360)}>
            <RotateIcon />
          </Button>
          <Button variant="plain" type="button" className="lightbox-tool" aria-label="Copy image" title="Copy image" onClick={() => void copy()}>
            <CopyIcon />
          </Button>
          <a className="lightbox-tool" href={src} download={downloadName(alt, mime)} aria-label="Download" title="Download">
            <DownloadIcon />
          </a>
          <a className="lightbox-tool" href={src} target="_blank" rel="noreferrer" aria-label="Open in new tab" title="Open in new tab">
            <ExternalIcon />
          </a>
          <span className="lightbox-divider" aria-hidden="true" />
          <Button variant="plain" type="button" className="lightbox-tool" aria-label="Close" title="Close (Esc)" onClick={onClose}>
            ×
          </Button>
        </div>
      </div>
      <div className="lightbox-stage" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <img
          className={`lightbox-image${zoomed ? ' is-zoomed' : ''}${dragging ? ' is-dragging' : ''}`}
          src={src}
          alt={alt}
          draggable={false}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)` }}
          onDoubleClick={() => (zoomed ? reset() : zoomTo(2))}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      </div>
      <p className="lightbox-hint" aria-live="polite">
        {notice ?? (zoomed ? 'Drag to move · double-click to reset' : 'Double-click or ⌘/Ctrl + scroll to zoom')}
      </p>
    </div>,
    document.body
  );
}

function RotateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" />
      <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </svg>
  );
}
