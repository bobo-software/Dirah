import { type CSSProperties, type ReactNode, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EMPTY_PAGES, usePageStore } from '../../stores/StoresIndex';
import type { PublicPage } from '../../api/client';
import { pageStatusLabel, parsePageStatus } from './pageStatus';
import { categoryHue } from './categoryColor';

export function DocsBrowser({ workspaceId, title }: { workspaceId: string; title?: ReactNode }) {
  const pages = usePageStore((state) => state.byWorkspace[workspaceId] ?? EMPTY_PAGES);
  const setFavorite = usePageStore((state) => state.setFavorite);
  const [message, setMessage] = useState<string | null>(null);

  async function onFavorite(page: PublicPage) {
    try {
      await setFavorite(page.id, !page.favorited);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update favorite');
    }
  }

  const documents = useMemo(
    () => pages.filter((page) => page.kind !== 'folder'),
    [pages]
  );

  const folderTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const page of pages) {
      if (page.kind === 'folder') map.set(page.id, page.title);
    }
    return map;
  }, [pages]);

  return (
    <>
      {title ? (
        <div className="collection-head">
          <h1>{title}</h1>
        </div>
      ) : null}
      <p className="muted">Live markdown files in this workspace. Status is shared for every member.</p>
      {message ? (
        <p className="error" role="alert">
          {message}
        </p>
      ) : null}
      {documents.length === 0 ? (
        <p className="muted">No live documents yet.</p>
      ) : (
        <div className="docs-grid">
          {documents.map((page) => (
            <DocCard
              key={page.id}
              page={page}
              workspaceId={workspaceId}
              location={(page.parentId && folderTitles.get(page.parentId)) || 'Workspace root'}
              onFavorite={() => void onFavorite(page)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function DocCard({
  page,
  workspaceId,
  location,
  onFavorite,
}: {
  page: PublicPage;
  workspaceId: string;
  location: string;
  onFavorite: () => void;
}) {
  const year = new Date(page.createdAt).getFullYear();
  const status = parsePageStatus(page.status);
  const cardStyle = { '--card-hue': categoryHue(page.id) } as CSSProperties;

  return (
    <div className="doc-card" style={cardStyle}>
      <Link to={`/w/${workspaceId}/p/${page.id}`} className="doc-card-link">
        <div className="doc-card-meta">
          <span>{year}</span>
          <span className="doc-card-location">{location}</span>
        </div>
        <h3 className="doc-card-title">{page.title}</h3>
        {page.excerpt ? <p className="doc-card-excerpt">{page.excerpt}</p> : null}
      </Link>
      <div className="doc-card-foot">
        {status ? <span className="doc-card-status">{pageStatusLabel(status)}</span> : <span />}
        <button
          type="button"
          className={page.favorited ? 'linkish star on' : 'linkish star'}
          aria-label={page.favorited ? 'Remove favorite' : 'Favorite'}
          onClick={onFavorite}
        >
          {page.favorited ? '★' : '☆'}
        </button>
      </div>
    </div>
  );
}
