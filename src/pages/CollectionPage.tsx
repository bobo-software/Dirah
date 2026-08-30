import { useMemo, useState } from 'react';
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { patchPage } from '../api/pages';
import type { PublicPage } from '../api/client';
import { canEdit, type WorkspaceOutlet } from './workspaceContext';
import { PAGE_STATUSES, pageStatusLabel, parsePageStatus, type PageStatus } from './pageStatus';

export function CollectionPage() {
  const { workspaceId } = useParams();
  const { role, accessToken, refreshPages, pages } = useOutletContext<WorkspaceOutlet>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const editable = canEdit(role);
  const view = searchParams.get('view') === 'kanban' ? 'kanban' : 'table';

  async function onStatus(page: PublicPage, status: PageStatus) {
    if (!accessToken || !editable) return;
    try {
      await patchPage(accessToken, page.id, { status });
      setMessage(null);
      await refreshPages();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update status');
    }
  }

  function onView(next: 'table' | 'kanban') {
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'kanban') {
      nextParams.set('view', 'kanban');
    } else {
      nextParams.delete('view');
    }
    setSearchParams(nextParams, { replace: true });
  }

  const grouped = useMemo(() => {
    const buckets: Record<PageStatus, PublicPage[]> = { '': [], todo: [], doing: [], done: [] };
    for (const page of pages) {
      buckets[parsePageStatus(page.status)].push(page);
    }
    return buckets;
  }, [pages]);

  if (!workspaceId) {
    return <p className="muted">Missing workspace.</p>;
  }

  return (
    <section className="collection-pane">
      <div className="collection-head">
        <h1>Collection</h1>
        <div className="view-toggle" role="group" aria-label="Collection view">
          <button
            type="button"
            className={view === 'table' ? 'linkish on' : 'linkish'}
            aria-pressed={view === 'table'}
            onClick={() => onView('table')}
          >
            Table
          </button>
          <button
            type="button"
            className={view === 'kanban' ? 'linkish on' : 'linkish'}
            aria-pressed={view === 'kanban'}
            onClick={() => onView('kanban')}
          >
            Kanban
          </button>
        </div>
      </div>
      <p className="muted">Live pages in this workspace. Status is shared for every member.</p>
      {message ? (
        <p className="error" role="alert">
          {message}
        </p>
      ) : null}
      {pages.length === 0 ? (
        <p className="muted">No live pages yet.</p>
      ) : view === 'table' ? (
        <table className="collection-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page.id}>
                <td>
                  <Link to={`/w/${workspaceId}/p/${page.id}`}>{page.title}</Link>
                </td>
                <td>
                  <StatusControl
                    page={page}
                    editable={editable}
                    onChange={(status) => void onStatus(page, status)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="collection-board">
          {PAGE_STATUSES.map((status) => (
            <section key={status || 'none'} className="collection-column">
              <h2>{pageStatusLabel(status)}</h2>
              {grouped[status].length === 0 ? (
                <p className="muted">Empty</p>
              ) : (
                <ul>
                  {grouped[status].map((page) => (
                    <li key={page.id}>
                      <Link to={`/w/${workspaceId}/p/${page.id}`}>{page.title}</Link>
                      <StatusControl
                        page={page}
                        editable={editable}
                        onChange={(next) => void onStatus(page, next)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusControl({
  page,
  editable,
  onChange,
}: {
  page: PublicPage;
  editable: boolean;
  onChange: (status: PageStatus) => void;
}) {
  const status = parsePageStatus(page.status);
  if (!editable) {
    return <span>{pageStatusLabel(status)}</span>;
  }
  return (
    <select
      aria-label={`Status for ${page.title}`}
      value={status}
      onChange={(event) => onChange(parsePageStatus(event.target.value))}
    >
      {PAGE_STATUSES.map((value) => (
        <option key={value || 'none'} value={value}>
          {pageStatusLabel(value)}
        </option>
      ))}
    </select>
  );
}
