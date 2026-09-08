import { type FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuthStore, useInviteStore } from '../stores/StoresIndex';
import { Logo } from '../components/Logo';
import type { InvitePreview } from '../api/members';

export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const user = useAuthStore((state) => state.user);
  const ready = useAuthStore((state) => state.ready);
  const acceptInvite = useAuthStore((state) => state.acceptInvite);
  const acceptInviteAsSession = useAuthStore((state) => state.acceptInviteAsSession);
  const logout = useAuthStore((state) => state.logout);
  const fetchPreview = useInviteStore((state) => state.fetchPreview);
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
    void fetchPreview(token)
      .then(setPreview)
      .catch(() => setMissing(true));
  }, [token, fetchPreview]);

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
  const invitePath = `/invite/${inviteToken}`;
  const emailMatch = Boolean(user && user.email.toLowerCase() === preview.email.toLowerCase());

  async function onCreateAccount(event: FormEvent) {
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

  async function onAcceptAsSession() {
    setBusy(true);
    setMessage(null);
    try {
      const workspace = await acceptInviteAsSession(inviteToken);
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
        <strong>{preview.invitedByEmail}</strong> invited you as <strong>{preview.role}</strong> (
        {preview.email}).
      </p>

      {user && emailMatch ? (
        <>
          <p className="muted">You are signed in as {user.email}. Accept to join this workspace.</p>
          {message ? <p className="error">{message}</p> : null}
          <button type="button" disabled={busy} onClick={() => void onAcceptAsSession()}>
            {busy ? 'Joining…' : 'Accept invite'}
          </button>
        </>
      ) : null}

      {user && !emailMatch ? (
        <>
          <p className="muted">
            You are signed in as {user.email}, but this invite is for {preview.email}. Sign out to continue
            with the invited account.
          </p>
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
      ) : null}

      {!user && preview.accountExists ? (
        <>
          <p className="muted">You already have a Dira account. Sign in to accept this invite.</p>
          <p>
            <Link to="/login" state={{ from: invitePath }}>
              Log in to continue
            </Link>
          </p>
        </>
      ) : null}

      {!user && !preview.accountExists ? (
        <form onSubmit={(event) => void onCreateAccount(event)}>
          <p className="muted">Create an account with this email to view the workspace.</p>
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
            {busy ? 'Creating account…' : 'Create account & join'}
          </button>
        </form>
      ) : null}
    </main>
  );
}
