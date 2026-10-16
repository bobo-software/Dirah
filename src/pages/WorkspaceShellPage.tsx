import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate, useParams } from 'react-router-dom';
import { EMPTY_PAGES, usePageStore, useWorkspaceStore } from '../stores/StoresIndex';
import type { PageKind, PublicPage } from '../api/client';
import {
  EmptyEditorPane,
  HomeIcon,
  NotesSidebarSection,
  TasksSidebarSection,
  TicketsSidebarSection,
  PageTree,
  Sidebar,
  buildPageTree,
  draggedPageId,
  setLastWorkspaceId,
  useSidebarDrawer,
} from '../components/ComponentsIndex';
import { confirmDelete } from '../components/layout/deleteDialogue';
import { canEdit, workspaceSection } from './workspaceContext';

export function WorkspaceShellPage() {
  const { workspaceId, pageId, noteId } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isNotesHome = Boolean(useMatch('/w/:workspaceId'));
  const isDocsHome = Boolean(useMatch('/w/:workspaceId/docs'));
  const isTrash = Boolean(useMatch('/w/:workspaceId/trash'));
  const isNote = Boolean(useMatch('/w/:workspaceId/n/:noteId'));
  const isCollection = Boolean(useMatch('/w/:workspaceId/collection'));
  const isTasks = Boolean(useMatch('/w/:workspaceId/tasks/*'));
  const isTickets = Boolean(useMatch('/w/:workspaceId/tickets/*'));
  const isSettings = Boolean(useMatch('/w/:workspaceId/settings/*'));
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const fetchWorkspaces = useWorkspaceStore((state) => state.fetchWorkspaces);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);
  const pages = usePageStore((state) => state.byWorkspace[workspaceId ?? ''] ?? EMPTY_PAGES);
  const fetchPages = usePageStore((state) => state.fetchPages);
  const pageStoreCreatePage = usePageStore((state) => state.createPage);
  const pageStorePatchPage = usePageStore((state) => state.patchPage);
  const pageStoreTrashPage = usePageStore((state) => state.trashPage);
  const pageStoreSetFavorite = usePageStore((state) => state.setFavorite);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [rootOver, setRootOver] = useState(false);
  const { open: sidebarOpen, setOpen: setSidebarOpen, narrow } = useSidebarDrawer();

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!workspaceId) return;
    setLastWorkspaceId(workspaceId);
    void (async () => {
      try {
        await Promise.all([fetchWorkspaces(), setActiveWorkspace(workspaceId)]);
        await fetchPages(workspaceId, { q: query || undefined });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Workspace not found');
      }
    })();
  }, [workspaceId, query, fetchWorkspaces, setActiveWorkspace, fetchPages]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pageId, noteId, isNotesHome, isDocsHome, isTrash, isCollection, workspaceId, setSidebarOpen]);

  async function onCreateNode(kind: PageKind = 'markdown', parentId?: string | null) {
    if (!workspaceId) return;
    setBusy(true);
    setMessage(null);
    try {
      const id = crypto.randomUUID();
      const title = kind === 'folder' ? 'Folder' : 'Untitled';
      const page = await pageStoreCreatePage(workspaceId, { id, title, parentId: parentId ?? null, kind });
      navigate(`/w/${workspaceId}/p/${page.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create page');
    } finally {
      setBusy(false);
    }
  }

  async function commitRename(page: PublicPage) {
    const title = renameValue.trim() || 'Untitled';
    try {
      await pageStorePatchPage(page.id, { title });
      setRenamingId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not rename page');
    }
  }

  async function onTrash(page: PublicPage) {
    if (!workspaceId) return;
    const confirmed = await confirmDelete({
      title: 'Move to trash?',
      message: `Move “${page.title}” and nested pages to trash?`,
      confirmLabel: 'Move to trash',
    });
    if (!confirmed) return;
    try {
      await pageStoreTrashPage(page.id);
      if (pageId === page.id) {
        navigate(`/w/${workspaceId}/docs`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not trash page');
    }
  }

  async function onFavorite(page: PublicPage) {
    try {
      await pageStoreSetFavorite(page.id, !page.favorited);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update favorite');
    }
  }

  function onToggleExpand(pageId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  }

  async function onMove(draggedId: string, parentId: string | null) {
    const current = pages.find((page) => page.id === draggedId);
    if (current && current.parentId === parentId) return;
    try {
      await pageStorePatchPage(draggedId, { parentId });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not move page');
    }
  }

  const workspace = workspaces.find((item) => item.id === workspaceId);

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

  if (!workspaceId || !workspace) {
    return <p className="muted">Loading workspace…</p>;
  }

  const editable = canEdit(workspace.role);
  const section = workspace.encrypted ? 'docs' : workspaceSection(pathname);
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
    expandedIds,
    onToggleExpand,
  };

  return (
    <div className="shell">
      <Sidebar
        workspace={workspace}
        open={sidebarOpen}
        narrow={narrow}
        onClose={() => setSidebarOpen(false)}
      >
        {section === 'notes' ? (
          <NotesSidebarSection workspaceId={workspaceId} noteId={noteId} />
        ) : section === 'tasks' ? (
          <TasksSidebarSection workspaceId={workspaceId} />
        ) : section === 'tickets' ? (
          <TicketsSidebarSection workspaceId={workspaceId} editable={editable} />
        ) : (
          <>
            <NavLink className="sidebar-home" to={`/w/${workspaceId}/docs`} end>
              <HomeIcon />
              <span>Home</span>
            </NavLink>
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
              className={rootOver ? 'sidebar-pages-header drop-target' : 'sidebar-pages-header'}
              onDragOver={(event) => {
                if (!editable) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setRootOver(true);
              }}
              onDragLeave={(event) => {
                const related = event.relatedTarget as Node | null;
                if (related && event.currentTarget.contains(related)) return;
                setRootOver(false);
              }}
              onDrop={(event) => {
                if (!editable) return;
                event.preventDefault();
                setRootOver(false);
                const dragged = draggedPageId(event.dataTransfer);
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
          </>
        )}
      </Sidebar>
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
            {section === 'notes' ? 'Notes' : section === 'tasks' ? 'Tasks' : section === 'tickets' ? 'Tickets' : 'Pages'}
          </button>
          {currentTitle ? (
            <span className="mobile-title">{currentTitle}</span>
          ) : isNotesHome || isDocsHome ? (
            <span className="mobile-title">{workspace.name}</span>
          ) : isCollection ? (
            <span className="mobile-title">Collection</span>
          ) : isTrash ? (
            <span className="mobile-title">Trash</span>
          ) : isNote ? (
            <span className="mobile-title">Notes</span>
          ) : isTasks ? (
            <span className="mobile-title">Tasks</span>
          ) : isTickets ? (
            <span className="mobile-title">Tickets</span>
          ) : isSettings ? (
            <span className="mobile-title">Settings</span>
          ) : null}
        </div>
        {pageId || isNotesHome || isDocsHome || isTrash || isCollection || isSettings || isNote || isTasks || isTickets ? (
          <Outlet
            context={{
              role: workspace.role,
              pageTitle: currentTitle,
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
