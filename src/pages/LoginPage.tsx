import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/StoresIndex';
import { BrandLink, OAuthButtons, ThemeToggle } from '../components/ComponentsIndex';

export function LoginPage() {
  const user = useAuthStore((state) => state.user);
  const ready = useAuthStore((state) => state.ready);
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(searchParams.get('oauth'));
  const [busy, setBusy] = useState(false);

  if (!ready) return <p className="muted">Loading…</p>;
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? '/'} replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <main className="auth-card login-card">
        <div className="auth-card-corner">
          <ThemeToggle />
        </div>
        <h1 className="auth-brand">
          <BrandLink to="/" size="lg" />
        </h1>
        <p className="muted">Sign in to your workspace</p>
        <OAuthButtons />
        <form onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {message ? <p className="error">{message}</p> : null}
          <button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="auth-foot">
          No account? <Link to="/register">Create one</Link>
        </p>
      </main>
    </div>
  );
}
