import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './stores/StoresIndex';
import { AdminShell, AppFrame, RequireAuth, RequireSystemAdmin } from './components/ComponentsIndex';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { InvitePage } from './pages/InvitePage';
import { OAuthCatchPage } from './pages/OAuthCatchPage';
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { AdminOverviewPage } from './pages/admin/AdminOverviewPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminEmailsPage } from './pages/admin/AdminEmailsPage';
import { AdminRequestLogsPage } from './pages/admin/AdminRequestLogsPage';
import { AccountSettingsPage } from './pages/AccountSettingsPage';
import { HomeGate } from './pages/HomePage';
import { PrivacyPage } from './pages/legal/PrivacyPage';
import { TermsPage } from './pages/legal/TermsPage';
import { CookiesPage } from './pages/legal/CookiesPage';
import { SettingsPage } from './pages/SettingsPage';
import { McpTokenDetailPage } from './pages/McpTokenDetailPage';
import { McpTokenCreatePage } from './pages/McpTokenCreatePage';
import { McpOAuthConsentPage } from './pages/McpOAuthConsentPage';
import { WorkspaceShellPage } from './pages/WorkspaceShellPage';

const WorkspaceNodePage = lazy(async () => {
  const mod = await import('./pages/WorkspaceNodePage');
  return { default: mod.WorkspaceNodePage };
});

const PublicSharePage = lazy(async () => {
  const mod = await import('./pages/PublicSharePage');
  return { default: mod.PublicSharePage };
});

const TrashPage = lazy(async () => {
  const mod = await import('./pages/TrashPage');
  return { default: mod.TrashPage };
});

const CollectionPage = lazy(async () => {
  const mod = await import('./pages/CollectionPage');
  return { default: mod.CollectionPage };
});

const NotePage = lazy(async () => {
  const mod = await import('./pages/notes/NotePage');
  return { default: mod.NotePage };
});

const NotesLandingPage = lazy(async () => {
  const mod = await import('./pages/notes/NotesLandingPage');
  return { default: mod.NotesLandingPage };
});

const WorkspaceHomePage = lazy(async () => {
  const mod = await import('./pages/WorkspaceHomePage');
  return { default: mod.WorkspaceHomePage };
});

export default function App() {
  useEffect(() => {
    void useAuthStore.getState().initAuth();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeGate />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/cookies" element={<CookiesPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/oauth" element={<OAuthCatchPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route element={<RequireSystemAdmin />}>
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<AdminOverviewPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="emails" element={<AdminEmailsPage />} />
            <Route path="request-logs" element={<AdminRequestLogsPage />} />
          </Route>
        </Route>
        <Route
          path="/s/:token"
          element={
            <Suspense fallback={<p className="muted">Loading shared page…</p>}>
              <PublicSharePage />
            </Suspense>
          }
        />
        <Route element={<RequireAuth />}>
          <Route element={<AppFrame />}>
            <Route path="/settings" element={<AccountSettingsPage />} />
            <Route path="/settings/mcp/new" element={<McpTokenCreatePage />} />
            <Route path="/settings/mcp/:tokenId" element={<McpTokenDetailPage />} />
            <Route path="/settings/mcp-oauth" element={<McpOAuthConsentPage />} />
            <Route path="/w/:workspaceId" element={<WorkspaceShellPage />}>
              <Route
                index
                element={
                  <Suspense fallback={<p className="muted">Loading notes…</p>}>
                    <NotesLandingPage />
                  </Suspense>
                }
              />
              <Route
                path="docs"
                element={
                  <Suspense fallback={<p className="muted">Loading docs…</p>}>
                    <WorkspaceHomePage />
                  </Suspense>
                }
              />
              <Route
                path="p/:pageId"
                element={
                  <Suspense fallback={<p className="muted">Loading editor…</p>}>
                    <WorkspaceNodePage />
                  </Suspense>
                }
              />
              <Route
                path="n/:noteId"
                element={
                  <Suspense fallback={<p className="muted">Loading note…</p>}>
                    <NotePage />
                  </Suspense>
                }
              />
              <Route
                path="collection"
                element={
                  <Suspense fallback={<p className="muted">Loading collection…</p>}>
                    <CollectionPage />
                  </Suspense>
                }
              />
              <Route
                path="trash"
                element={
                  <Suspense fallback={<p className="muted">Loading trash…</p>}>
                    <TrashPage />
                  </Suspense>
                }
              />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="settings/mcp/new" element={<McpTokenCreatePage />} />
              <Route path="settings/mcp/:tokenId" element={<McpTokenDetailPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
