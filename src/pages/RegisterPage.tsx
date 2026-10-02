import { type FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/StoresIndex';
import { BrandLink, OAuthButtons, ThemeToggle } from '../components/ComponentsIndex';

export function RegisterPage() {
  const user = useAuthStore((state) => state.user);
  const ready = useAuthStore((state) => state.ready);
  const register = useAuthStore((state) => state.register);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nextPath, setNextPath] = useState<string | null>(null);

  if (!ready) return <p className="muted">Loading…</p>;
  if (nextPath) return <Navigate to={nextPath} replace />;
  if (user) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const workspace = await register(email, password);
      setNextPath(`/w/${workspace.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not register');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-card">
      <div className="auth-card-corner">
        <ThemeToggle />
      </div>
      <div className="auth-brand">
        <BrandLink to="/" size="lg" />
      </div>
      <h1>Create account</h1>
      <p className="muted">A workspace named “My workspace” is created for you.</p>
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
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {message ? <p className="error">{message}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Register'}
        </button>
      </form>
      <p>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </main>
  );
}
