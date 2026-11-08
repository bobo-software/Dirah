import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { formatDuration, searchAssets, type MediaAsset } from '../../api/assets';
import { useAuthStore } from '../../stores/StoresIndex';
import { dragHasFiles } from './dragFiles';

function MediaBadge({ asset }: { asset: MediaAsset }) {
  if (asset.status === 'processing') return <span className="asset-badge">Processing…</span>;
  if (asset.status === 'failed') return <span className="asset-badge error">No preview</span>;
  if (asset.mediaType === 'video') return <span className="asset-badge">▶ {formatDuration(asset.durationMs)}</span>;
  if (asset.mediaType === 'audio') return <span className="asset-badge">♪ {formatDuration(asset.durationMs)}</span>;
  if (asset.mediaType === 'model') return <span className="asset-badge">3D · {asset.ext.toUpperCase()}</span>;
  return null;
}

/**
 * Thumbnail grid of the media assets directly inside a folder (or the root).
 * `assetIds` is the folder's current asset children from the page tree, so the
 * grid reloads when files are added, moved or removed. Polls while any asset
 * is still being processed.
 */
export function AssetGallery({
  workspaceId,
  parentId,
  assetIds,
  editable,
  onDropFiles,
}: {
  workspaceId: string;
  parentId: string | null;
  assetIds: string[];
  editable: boolean;
  onDropFiles?: (files: File[]) => void;
}) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const idsKey = useMemo(() => [...assetIds].sort().join(','), [assetIds]);
  const processing = assets.some((asset) => asset.status === 'processing');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!accessToken || !idsKey) return;
    let cancelled = false;
    searchAssets(accessToken, workspaceId, { parentId: parentId ?? 'root', limit: 100 })
      .then((result) => {
        if (!cancelled) {
          setAssets(result.assets);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load media');
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, workspaceId, parentId, idsKey, tick]);

  useEffect(() => {
    if (!processing) return;
    const timer = window.setTimeout(() => setTick((value) => value + 1), 2000);
    return () => window.clearTimeout(timer);
  }, [processing, assets]);

  function onDragOver(event: DragEvent) {
    if (!editable || !onDropFiles || !dragHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setOver(true);
  }

  function onDrop(event: DragEvent) {
    if (!editable || !onDropFiles) return;
    event.preventDefault();
    setOver(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length) onDropFiles(files);
  }

  // With no asset children the last fetch is stale (everything was moved or trashed): show nothing.
  const ordered = useMemo(
    () => (idsKey ? [...assets].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true })) : []),
    [assets, idsKey]
  );

  return (
    <div
      className={over ? 'asset-gallery drop-target' : 'asset-gallery'}
      onDragOver={onDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      {error ? <p className="error">{error}</p> : null}
      {ordered.length === 0 ? (
        editable && onDropFiles ? (
          <p className="asset-drop-hint muted">Drop images, video or audio here to add them to this folder.</p>
        ) : null
      ) : (
        <ul className="asset-grid">
          {ordered.map((asset) => (
            <li key={asset.id}>
              <Link className="asset-card" to={`/w/${workspaceId}/p/${asset.id}`} title={asset.description || asset.title}>
                <span className={`asset-thumb ${asset.mediaType}`}>
                  {asset.links.thumbnailUrl ? (
                    <img src={asset.links.thumbnailUrl.url} alt="" loading="lazy" />
                  ) : (
                    <span className="asset-thumb-glyph" aria-hidden="true">
                      {asset.mediaType === 'video' ? '🎬' : asset.mediaType === 'audio' ? '🎵' : asset.mediaType === 'model' ? '🧊' : '🖼'}
                    </span>
                  )}
                  <MediaBadge asset={asset} />
                </span>
                <span className="asset-card-title">{asset.title}</span>
                {asset.tags.length ? <span className="asset-card-tags">{asset.tags.slice(0, 3).join(' · ')}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
