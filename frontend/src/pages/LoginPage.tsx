import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/StoresIndex';
import { readReturnTo } from '../utils/returnTo';
import { BrandLink, OAuthButtons, PasswordField, ThemeToggle } from '../components/ComponentsIndex';
import { Button } from '../components/buttons/Button';

export function LoginPage() {
  const user = useAuthStore((state) => state.user);
  const ready = useAuthStore((state) => state.ready);
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // An invite hands over the invited address so the person only types a password.
  const [email, setEmail] = useState(() => (location.state as { email?: string } | null)?.email ?? '');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(searchParams.get('oauth'));
  const [busy, setBusy] = useState(false);
  // login() sets the user before it finishes unlocking keys, so the render below
  // may already have redirected; a second navigate would replay the target page.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (!ready) return <p className="muted">Loading…</p>;
  if (user) {
    const from = (location.state as { from?: string } | null)?.from ?? readReturnTo();
    return <Navigate to={from ?? '/'} replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await login(email, password);
      if (!mounted.current) return;
      const from = (location.state as { from?: string } | null)?.from ?? readReturnTo();
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
          <PasswordField value={password} onChange={setPassword} />
          {message ? <p className="error">{message}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="auth-foot">
          No account? <Link to="/register">Create one</Link>
        </p>
      </main>
    </div>
  );
}
