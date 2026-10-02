import { type FormEvent, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuthStore } from '../../stores/StoresIndex';
import { Logo, ThemeToggle } from '../../components/ComponentsIndex';

export function AdminLoginPage() {
  const admin = useAdminAuthStore((state) => state.admin);
  const ready = useAdminAuthStore((state) => state.ready);
  const login = useAdminAuthStore((state) => state.login);
  const initAdminAuth = useAdminAuthStore((state) => state.initAdminAuth);
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void initAdminAuth();
  }, [initAdminAuth]);

  if (!ready) return <p className="muted">Loading…</p>;
  if (admin) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? '/admin'} replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/admin');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-card">
      <div className="auth-card-corner">
        <ThemeToggle />
      </div>
      <h1 className="auth-brand" aria-label="Dirah">
        <Logo size="lg" decorative />
      </h1>
      <p className="muted">System admin sign in</p>
      <form onSubmit={onSubmit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
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
    </main>
  );
}
