import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { AppFrame, RequireAuth } from './layout/AppFrame';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { InvitePage } from './pages/InvitePage';
import { OAuthCatchPage } from './pages/OAuthCatchPage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { SettingsPage } from './pages/SettingsPage';
import { McpOAuthConsentPage } from './pages/McpOAuthConsentPage';
import { WorkspaceShellPage } from './pages/WorkspaceShellPage';
import { SyncProvider } from './sync/SyncProvider';

const PageEditorPage = lazy(async () => {
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
  return (
    <AuthProvider>
      <SyncProvider>
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
                <Route path="/" element={<WorkspacesPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/mcp-oauth" element={<McpOAuthConsentPage />} />
                <Route path="/w/:workspaceId" element={<WorkspaceShellPage />}>
                  <Route
                    path="p/:pageId"
                    element={
                      <Suspense fallback={<p className="muted">Loading editor…</p>}>
                        <PageEditorPage />
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
                </Route>
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </SyncProvider>
    </AuthProvider>
  );
}
