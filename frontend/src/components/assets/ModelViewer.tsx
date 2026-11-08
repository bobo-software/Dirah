import { createElement, useEffect, useState } from 'react';

/**
 * Interactive GLB viewer (orbit, zoom). Loads @google/model-viewer only when a
 * 3D asset is opened, so it stays out of the main bundle.
 */
export function ModelViewer({ src, poster, alt }: { src: string; poster?: string; alt: string }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import('@google/model-viewer')
      .then(() => !cancelled && setReady(true))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return poster ? <img src={poster} alt={alt} /> : <p className="muted">The 3D viewer could not load.</p>;
  if (!ready) return poster ? <img src={poster} alt={alt} /> : <p className="muted">Loading 3D viewer…</p>;
  return createElement('model-viewer', {
    class: 'asset-model-viewer',
    src,
    poster,
    alt,
    'camera-controls': true,
    'auto-rotate': true,
    'shadow-intensity': '0.8',
    exposure: '1',
    'interaction-prompt': 'none',
  });
}
