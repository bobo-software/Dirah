import { useEffect, useLayoutEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { REFRESH_KEY, useAuthStore } from '../stores/StoresIndex';
import { Logo } from '../components/ComponentsIndex';
import { readReturnTo } from '../utils/returnTo';

export function OAuthCatchPage() {
  const navigate = useNavigate();

  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const refresh = params.get('refreshToken');
    if (refresh) {
      localStorage.setItem(REFRESH_KEY, refresh);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    void useAuthStore.getState().initAuth().finally(() => {
      navigate(readReturnTo() ?? '/', { replace: true });
    });
  }, [navigate]);

  return (
    <main className="auth-card">
      <div className="auth-brand">
        <Logo size="lg" decorative />
      </div>
      <h1>Signing in…</h1>
      <p className="muted">If nothing happens, return to sign in and try again.</p>
      <p>
        <Link to="/login">Sign in</Link>
      </p>
    </main>
  );
}
