import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useMatch, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  createPage,
  deletePage,
  listPages,
  patchPage,
  setPageFavorite,
} from '../api/pages';
import type { PageKind, PublicPage, PublicWorkspace } from '../api/client';
import { CreateWorkspaceModal, Sidebar } from '../components/ComponentsIndex';
import { setLastWorkspaceId } from '../components/lastWorkspace';
import { useSidebarDrawer } from '../components/Sidebar';
import { EmptyEditorPane } from './EmptyEditorPane';
import { buildPageTree, PageTree } from './PageTree';
import { canAdmin, canEdit } from './workspaceContext';

export function WorkspaceShellPage() {
  const { workspaceId, pageId } = useParams();
  const navigate = useNavigate();
  const isTrash = Boolean(useMatch('/w/:workspaceId/trash'));
  const isCollection = Boolean(useMatch('/w/:workspaceId/collection'));
  const isSettings = Boolean(useMatch('/w/:workspaceId/settings'));
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
  const [createOpen, setCreateOpen] = useState(false);
  const { open: sidebarOpen, setOpen: setSidebarOpen, narrow } = useSidebarDrawer();

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
    setLastWorkspaceId(workspaceId);
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
    setSidebarOpen(false);
  }, [pageId, isTrash, isCollection, workspaceId, setSidebarOpen]);

  async function onCreateNode(kind: PageKind = 'markdown', parentId?: string | null) {
    if (!accessToken || !workspaceId) return;
    setBusy(true);
    setMessage(null);
    try {
      const id = crypto.randomUUID();
      const title = kind === 'folder' ? 'Folder' : 'Untitled';
      const page = await createPage(accessToken, workspaceId, {
        id,
        title,
        parentId: parentId ?? null,
        kind,
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
        <Link to="/">Back home</Link>
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
    onCreateChild: (parent: PublicPage, kind: PageKind) => void onCreateNode(kind, parent.id),
    onTrash: (page: PublicPage) => void onTrash(page),
    onFavorite: (page: PublicPage) => void onFavorite(page),
    onMove,
  };

  return (
    <div className="shell">
      <Sidebar
        workspaces={workspaces}
        workspace={workspace}
        open={sidebarOpen}
        narrow={narrow}
        onClose={() => setSidebarOpen(false)}
        onNewWorkspace={() => setCreateOpen(true)}
      >
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
            <span className="header-creates">
              <button
                type="button"
                className="linkish"
                onClick={() => void onCreateNode('markdown')}
                disabled={busy}
              >
                MD
              </button>
              <button
                type="button"
                className="linkish"
                onClick={() => void onCreateNode('folder')}
                disabled={busy}
              >
                Folder
              </button>
            </span>
          ) : null}
        </div>
        {pages.length === 0 ? (
          <p className="muted">{searching ? 'No matching pages.' : 'No pages yet.'}</p>
        ) : (
          <PageTree nodes={tree} {...treeProps} />
        )}
        {message ? (
          <p className="error" role="alert">
            {message}
          </p>
        ) : null}
      </Sidebar>
      <CreateWorkspaceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          setLastWorkspaceId(created.id);
          navigate(`/w/${created.id}`);
        }}
      />
      <section className="editor-pane">
        <div className="mobile-chrome">
          <button
            type="button"
            className="sidebar-toggle"
            aria-controls="workspace-sidebar"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <line x1="3.5" y1="6.5" x2="20.5" y2="6.5" />
              <line x1="3.5" y1="12" x2="20.5" y2="12" />
              <line x1="3.5" y1="17.5" x2="20.5" y2="17.5" />
            </svg>
            Pages
          </button>
          {currentTitle ? (
            <span className="mobile-title">{currentTitle}</span>
          ) : isCollection ? (
            <span className="mobile-title">Collection</span>
          ) : isTrash ? (
            <span className="mobile-title">Trash</span>
          ) : isSettings ? (
            <span className="mobile-title">Settings</span>
          ) : null}
        </div>
        {pageId || isTrash || isCollection || isSettings ? (
          <Outlet
            context={{
              role: workspace.role,
              accessToken,
              pageTitle: currentTitle,
              refreshPages,
              pages,
              workspaceId,
              onCreateNode: (kind: PageKind, parentId?: string | null) => void onCreateNode(kind, parentId),
            }}
          />
        ) : (
          <EmptyEditorPane
            onCreate={(kind) => void onCreateNode(kind)}
            busy={busy}
            hasPages={pages.length > 0}
            allowCreate={editable}
          />
        )}
      </section>
      </div>
  );
}
