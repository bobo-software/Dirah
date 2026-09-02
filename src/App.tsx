import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './stores/StoresIndex';
import { AppFrame, RequireAuth } from './layout/AppFrame';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { InvitePage } from './pages/InvitePage';
import { OAuthCatchPage } from './pages/OAuthCatchPage';
import { HomeRedirect, SettingsRedirect } from './components/ComponentsIndex';
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

export default function App() {
  useEffect(() => {
    void useAuthStore.getState().initAuth();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/oauth" element={<OAuthCatchPage />} />
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
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/settings" element={<SettingsRedirect />} />
            <Route path="/settings/mcp-oauth" element={<McpOAuthConsentPage />} />
            <Route path="/w/:workspaceId" element={<WorkspaceShellPage />}>
              <Route
                path="p/:pageId"
                element={
                  <Suspense fallback={<p className="muted">Loading editor…</p>}>
                    <WorkspaceNodePage />
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
