import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuthStore, useInviteStore, useWorkspaceStore } from '../stores/StoresIndex';
import { Logo } from '../components/ComponentsIndex';
import type { InvitePreview } from '../api/members';
import { clearReturnTo, rememberReturnTo } from '../utils/returnTo';

/**
 * Landing page for an invite link. Shows which workspace it is for, then:
 * an existing account signs in and is joined automatically on the way back;
 * a new email creates an account here and lands straight in the workspace.
 */
export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const ready = useAuthStore((state) => state.ready);
  const acceptInvite = useAuthStore((state) => state.acceptInvite);
  const acceptInviteAsSession = useAuthStore((state) => state.acceptInviteAsSession);
  const logout = useAuthStore((state) => state.logout);
  const fetchPreview = useInviteStore((state) => state.fetchPreview);
  const fetchWorkspaces = useWorkspaceStore((state) => state.fetchWorkspaces);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const autoAccepted = useRef(false);

  useEffect(() => {
    if (!token) return;
    void fetchPreview(token)
      .then(setPreview)
      .catch(() => setMissing(true));
  }, [token, fetchPreview]);

  const inviteToken = token ?? '';
  const emailMatch = Boolean(user && preview && user.email.toLowerCase() === preview.email.toLowerCase());
  // Set on the way back from sign-in, so joining needs no second click.
  const returningFromLogin = searchParams.get('accept') === '1';

  async function join(run: () => Promise<{ id: string }>) {
    setBusy(true);
    setMessage(null);
    try {
      const workspace = await run();
      clearReturnTo();
      await fetchWorkspaces(true).catch(() => undefined);
      setNextPath(`/w/${workspace.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not join');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!returningFromLogin || !emailMatch || autoAccepted.current) return;
    autoAccepted.current = true;
    void join(() => acceptInviteAsSession(inviteToken));
    // join is recreated each render; the ref keeps this to one attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returningFromLogin, emailMatch, inviteToken, acceptInviteAsSession]);

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

  function goToLogin() {
    const back = `/invite/${inviteToken}?accept=1`;
    // Location state covers password sign-in; returnTo covers Google/GitHub, which leave the app.
    rememberReturnTo(back);
    navigate('/login', { state: { from: back, email: preview?.email } });
  }

  return (
    <main className="auth-card invite-card">
      <div className="auth-brand">
        <Logo size="lg" decorative />
      </div>
      <p className="invite-eyebrow">Workspace invitation</p>
      <h1>{preview.workspaceName}</h1>
      <p className="muted">
        <strong>{preview.invitedByEmail}</strong> invited <strong>{preview.email}</strong> to join as{' '}
        <strong>{preview.role}</strong>.
      </p>

      {user && emailMatch ? (
        <>
          <p className="muted">You are signed in as {user.email}.</p>
          {message ? <p className="error">{message}</p> : null}
          <button type="button" disabled={busy} onClick={() => void join(() => acceptInviteAsSession(inviteToken))}>
            {busy ? 'Joining…' : `Join ${preview.workspaceName}`}
          </button>
        </>
      ) : null}

      {user && !emailMatch ? (
        <>
          <p className="invite-info" role="note">
            You are signed in as {user.email}, but this invite is for {preview.email}. Sign out, then open the link
            again with that account.
          </p>
          <button type="button" disabled={busy} onClick={() => void logout()}>
            Sign out
          </button>
        </>
      ) : null}

      {!user && preview.accountExists ? (
        <>
          <p className="muted">
            {preview.email} already has a Dirah account. Log in and you will be taken straight to the workspace.
          </p>
          <button type="button" className="invite-primary" onClick={goToLogin}>
            Log in to join
          </button>
        </>
      ) : null}

      {!user && !preview.accountExists ? (
        <>
          <p className="invite-info" role="note">
            <strong>No account yet.</strong> {preview.email} isn’t on Dirah. Create an account below to join{' '}
            {preview.workspaceName}.
          </p>
          <form onSubmit={(event) => {
            event.preventDefault();
            void join(() => acceptInvite(inviteToken, password));
          }}>
            <label>
              Email
              <input type="email" value={preview.email} readOnly aria-readonly="true" />
            </label>
            <label>
              Choose a password
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
        </>
      ) : null}
    </main>
  );
}

