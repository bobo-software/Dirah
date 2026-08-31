import { useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { REFRESH_KEY } from '../auth/AuthContext';

export function OAuthCatchPage() {
  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const refresh = params.get('refreshToken');
    if (refresh) {
      localStorage.setItem(REFRESH_KEY, refresh);
      window.location.replace('/');
    }
  }, []);

  return (
    <main className="auth-card">
      <h1>Signing in…</h1>
      <p className="muted">If nothing happens, return to sign in and try again.</p>
      <p>
        <Link to="/login">Sign in</Link>
      </p>
    </main>
  );
}
