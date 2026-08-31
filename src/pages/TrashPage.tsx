import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { deletePagePermanent, listPages, restorePage } from '../api/pages';
import type { PublicPage } from '../api/client';
import { canEdit, type WorkspaceOutlet } from './workspaceContext';

export function TrashPage() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const { role, accessToken, refreshPages } = useOutletContext<WorkspaceOutlet>();
  const [pages, setPages] = useState<PublicPage[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const editable = canEdit(role);

  const refresh = useCallback(async () => {
    if (!accessToken || !workspaceId) return;
    setPages(await listPages(accessToken, workspaceId, { trashed: true }));
  }, [accessToken, workspaceId]);

  useEffect(() => {
    void refresh().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Could not load trash');
    });
  }, [refresh]);

  async function onRestore(page: PublicPage) {
    if (!accessToken || !workspaceId) return;
    try {
      await restorePage(accessToken, page.id);
      await refresh();
      await refreshPages();
      navigate(`/w/${workspaceId}/p/${page.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not restore page');
    }
  }

  async function onPermanent(page: PublicPage) {
    if (!accessToken || !workspaceId) return;
    if (!window.confirm(`Permanently delete “${page.title}” and any nested pages still in trash?`)) {
      return;
    }
    try {
      await deletePagePermanent(accessToken, page.id);
      await refresh();
      await refreshPages();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not delete page');
    }
  }

  return (
    <section className="trash-pane">
      <h1>Trash</h1>
      <p className="muted">
        Nested pages stay in trash until restored. Restoring a page whose parent is still trashed
        moves it to the workspace root.
      </p>
      {message ? (
        <p className="error" role="alert">
          {message}
        </p>
      ) : null}
      {pages.length === 0 ? (
        <p className="muted">Trash is empty.</p>
      ) : (
        <ul className="trash-list">
          {pages.map((page) => (
            <li key={page.id}>
              <span>{page.title}</span>
              {editable ? (
                <span className="page-actions">
                  <button type="button" className="linkish" onClick={() => void onRestore(page)}>
                    Restore
                  </button>
                  <button
                    type="button"
                    className="linkish danger"
                    onClick={() => void onPermanent(page)}
                  >
                    Delete forever
                  </button>
                </span>
              ) : (
                <span className="muted">View only</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
