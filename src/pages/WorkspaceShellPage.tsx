import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useMatch, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  createPage,
  deletePage,
  listPages,
  patchPage,
  setPageFavorite,
} from '../api/pages';
import type { PublicPage, PublicWorkspace } from '../api/client';
import { EmptyEditorPane } from './EmptyEditorPane';
import { MembersPanel } from './MembersPanel';
import { PresencePanel } from './PresencePanel';
import { buildPageTree, PageTree } from './PageTree';
import { canAdmin, canEdit } from './workspaceContext';
import { FollowProvider } from '../sync/FollowContext';

export function WorkspaceShellPage() {
  const { workspaceId, pageId } = useParams();
  const navigate = useNavigate();
  const isTrash = Boolean(useMatch('/w/:workspaceId/trash'));
  const isCollection = Boolean(useMatch('/w/:workspaceId/collection'));
  const { accessToken, getWorkspace, listWorkspaces } = useAuth();
  const [workspace, setWorkspace] = useState<PublicWorkspace | null>(null);
  const [workspaces, setWorkspaces] = useState<PublicWorkspace[]>([]);
  const [pages, setPages] = useState<PublicPage[]>([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 767px)').matches);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [search]);

  const refreshPages = useCallback(async () => {
    if (!accessToken || !workspaceId) return;
    setPages(await listPages(accessToken, workspaceId, { q: query || undefined }));
  }, [accessToken, workspaceId, query]);

  useEffect(() => {
    if (!workspaceId) return;
    void (async () => {
      try {
        const [current, all] = await Promise.all([getWorkspace(workspaceId), listWorkspaces()]);
        setWorkspace(current);
        setWorkspaces(all);
        await refreshPages();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Workspace not found');
      }
    })();
  }, [workspaceId, getWorkspace, listWorkspaces, refreshPages]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setNarrow(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pageId, isTrash, isCollection, workspaceId]);

  useEffect(() => {
    if (!sidebarOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSidebarOpen(false);
    }
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  async function onCreatePage(parentId?: string | null) {
    if (!accessToken || !workspaceId) return;
    setBusy(true);
    setMessage(null);
    try {
      const id = crypto.randomUUID();
      const page = await createPage(accessToken, workspaceId, {
        id,
        title: 'Untitled',
        parentId: parentId ?? null,
      });
      await refreshPages();
      navigate(`/w/${workspaceId}/p/${page.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create page');
    } finally {
      setBusy(false);
    }
  }

  async function commitRename(page: PublicPage) {
    if (!accessToken) return;
    const title = renameValue.trim() || 'Untitled';
    try {
      await patchPage(accessToken, page.id, { title });
      setRenamingId(null);
      await refreshPages();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not rename page');
    }
  }

  async function onTrash(page: PublicPage) {
    if (!accessToken || !workspaceId) return;
    if (!window.confirm(`Move “${page.title}” and nested pages to trash?`)) return;
    try {
      await deletePage(accessToken, page.id);
      await refreshPages();
      if (pageId === page.id) {
        navigate(`/w/${workspaceId}`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not trash page');
    }
  }

  async function onFavorite(page: PublicPage) {
    if (!accessToken) return;
    try {
      await setPageFavorite(accessToken, page.id, !page.favorited);
      await refreshPages();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update favorite');
    }
  }

  async function onMove(draggedId: string, parentId: string | null) {
    if (!accessToken) return;
    try {
      await patchPage(accessToken, draggedId, { parentId });
      await refreshPages();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not move page');
    }
  }

  if (message && !workspace) {
    return (
      <section className="panel">
        <p className="error" role="alert">
          {message}
        </p>
        <Link to="/">Back to workspaces</Link>
      </section>
    );
  }

  if (!workspace || !workspaceId) {
    return <p className="muted">Loading workspace…</p>;
  }

  const editable = canEdit(workspace.role);
  const admin = canAdmin(workspace.role);
  const searching = Boolean(query);
  const favorites = pages.filter((page) => page.favorited);
  const tree = searching
    ? pages.map((page) => ({ page, children: [] }))
    : buildPageTree(pages);
  const currentTitle = pages.find((page) => page.id === pageId)?.title;

  const treeProps = {
    workspaceId,
    pageId,
    editable,
    admin,
    accessToken,
    renamingId,
    renameValue,
    onRenameValue: setRenameValue,
    onStartRename: (page: PublicPage) => {
      setRenamingId(page.id);
      setRenameValue(page.title);
    },
    onCommitRename: (page: PublicPage) => void commitRename(page),
    onCreateChild: (parent: PublicPage) => void onCreatePage(parent.id),
    onTrash: (page: PublicPage) => void onTrash(page),
    onFavorite: (page: PublicPage) => void onFavorite(page),
    onMove,
    encrypted: Boolean(workspace.encrypted),
  };

  return (
    <FollowProvider>
      <div className="shell">
      {sidebarOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close pages"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside
        className={sidebarOpen ? 'sidebar open' : 'sidebar'}
        id="workspace-sidebar"
        inert={narrow && !sidebarOpen ? true : undefined}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) {
            setSidebarOpen(false);
          }
        }}
      >
        <div className="sidebar-drawer-head">
          <button type="button" className="linkish sidebar-close" onClick={() => setSidebarOpen(false)}>
            Close
          </button>
        </div>
        <label className="sidebar-label" htmlFor="workspace-switcher">
          Workspace
        </label>
        <select
          id="workspace-switcher"
          value={workspace.id}
          onChange={(event) => navigate(`/w/${event.target.value}`)}
        >
          {workspaces.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <p className="muted role-badge">{workspace.role}</p>
        {workspace.encrypted ? <p className="muted">Encrypted</p> : null}
        <label className="sidebar-label" htmlFor="page-search">
          Search
        </label>
        <input
          id="page-search"
          type="search"
          placeholder="Search titles and text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {favorites.length > 0 && !searching ? (
          <>
            <p className="sidebar-label">Favorites</p>
            <PageTree nodes={favorites.map((page) => ({ page, children: [] }))} {...treeProps} />
          </>
        ) : null}
        <div
          className="sidebar-pages-header"
          onDragOver={(event) => {
            if (!editable) return;
            event.preventDefault();
          }}
          onDrop={(event) => {
            if (!editable) return;
            event.preventDefault();
            const dragged = event.dataTransfer.getData('text/page-id');
            if (dragged) void onMove(dragged, null);
          }}
        >
          <p className="sidebar-label">Pages</p>
          {editable ? (
            <button type="button" className="linkish" onClick={() => void onCreatePage()} disabled={busy}>
              New
            </button>
          ) : null}
        </div>
        {pages.length === 0 ? (
          <p className="muted">{searching ? 'No matching pages.' : 'No pages yet.'}</p>
        ) : (
          <PageTree nodes={tree} {...treeProps} />
        )}
        <div className="sidebar-links">
          <NavLink to={`/w/${workspaceId}/collection`} className="trash-link">
            Collection
          </NavLink>
          <NavLink to={`/w/${workspaceId}/trash`} className="trash-link">
            Trash
          </NavLink>
        </div>
        <PresencePanel pageOpen={Boolean(pageId) && !isTrash && !isCollection} />
        {admin && accessToken ? (
          <MembersPanel
            workspaceId={workspaceId}
            accessToken={accessToken}
            encrypted={Boolean(workspace.encrypted)}
            onEncrypted={() => {
              void getWorkspace(workspaceId).then(setWorkspace);
            }}
          />
        ) : null}
        {message ? (
          <p className="error" role="alert">
            {message}
          </p>
        ) : null}
      </aside>
      <section className="editor-pane">
        <div className="mobile-chrome">
          <button
            type="button"
            className="sidebar-toggle"
            aria-controls="workspace-sidebar"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            Pages
          </button>
          {currentTitle ? (
            <span className="mobile-title">{currentTitle}</span>
          ) : isCollection ? (
            <span className="mobile-title">Collection</span>
          ) : isTrash ? (
            <span className="mobile-title">Trash</span>
          ) : null}
        </div>
        {pageId || isTrash || isCollection ? (
          <Outlet
            context={{
              role: workspace.role,
              accessToken,
              pageTitle: currentTitle,
              refreshPages,
              pages,
              encrypted: Boolean(workspace.encrypted),
            }}
          />
        ) : (
          <EmptyEditorPane
            onCreate={() => void onCreatePage()}
            busy={busy}
            hasPages={pages.length > 0}
            allowCreate={editable}
          />
        )}
      </section>
      </div>
    </FollowProvider>
  );
}
