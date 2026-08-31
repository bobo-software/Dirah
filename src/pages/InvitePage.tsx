import { type FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Logo } from '../components/Logo';
import { previewInvite, type InvitePreview } from '../api/members';

export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, ready, acceptInvite, logout } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!token) {
      setMissing(true);
      return;
    }
    void previewInvite(token)
      .then(setPreview)
      .catch(() => setMissing(true));
  }, [token]);

  if (!ready) return <p className="muted">Loading…</p>;
  if (nextPath) return <Navigate to={nextPath} replace />;
  if (missing || !token) {
    return (
      <main className="auth-card">
        <div className="auth-brand">
          <Logo size="lg" decorative />
        </div>
        <h1>Invite not found</h1>
        <p className="muted">This link is invalid, expired, or already used.</p>
        <p>
          <Link to="/login">Sign in</Link>
        </p>
      </main>
    );
  }
  if (!preview) return <p className="muted">Loading invite…</p>;
  const inviteToken = token;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const workspace = await acceptInvite(inviteToken, password);
      setNextPath(`/w/${workspace.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not join');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-card">
      <div className="auth-brand">
        <Logo size="lg" decorative />
      </div>
      <h1>Join {preview.workspaceName}</h1>
      <p className="muted">
        Invited as {preview.role}: {preview.email}
      </p>
      {user ? (
        <>
          <p className="muted">You are signed in as {user.email}. Sign out to accept this invite.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void logout();
            }}
          >
            Sign out
          </button>
        </>
      ) : (
        <form onSubmit={(event) => void onSubmit(event)}>
          <label>
            Password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              aria-label="New password"
            />
          </label>
          {message ? <p className="error">{message}</p> : null}
          <button type="submit" disabled={busy}>
            {busy ? 'Joining…' : 'Join workspace'}
          </button>
        </form>
      )}
    </main>
  );
}
