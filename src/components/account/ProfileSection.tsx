import { useEffect, useState, type FormEvent } from 'react';
import { useAuthStore, useWorkspaceStore } from '../../stores/StoresIndex';
import { Button } from '../buttons/Button';

const ROLE_SUGGESTIONS = ['Founder', 'Engineer', 'Designer', 'Product', 'Writer', 'Researcher', 'Operations'];

function blank(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function titleCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

export function ProfileSection() {
  const user = useAuthStore((state) => state.user);
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const fetchWorkspaces = useWorkspaceStore((state) => state.fetchWorkspaces);
  const [name, setName] = useState(user?.name ?? '');
  const [role, setRole] = useState(user?.role ?? '');
  const [about, setAbout] = useState(user?.about ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(user?.hasPassword !== undefined);
  const hasPassword = user?.hasPassword === true;

  useEffect(() => {
    void refreshUser()
      .catch(() => undefined)
      .finally(() => setReady(true));
    void fetchWorkspaces().catch(() => undefined);
  }, [refreshUser, fetchWorkspaces]);

  useEffect(() => {
    setName(user?.name ?? '');
    setRole(user?.role ?? '');
    setAbout(user?.about ?? '');
    setEmail(user?.email ?? '');
  }, [user?.name, user?.role, user?.about, user?.email]);

  const emailChanged = email.trim().toLowerCase() !== (user?.email ?? '').toLowerCase();
  const dirty =
    blank(name) !== blank(user?.name) ||
    blank(role) !== blank(user?.role) ||
    blank(about) !== blank(user?.about) ||
    emailChanged;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await updateProfile({
        name: blank(name),
        role: blank(role),
        about: blank(about),
        email,
        currentPassword: emailChanged && hasPassword ? currentPassword : undefined,
      });
      setCurrentPassword('');
      setMessage('Profile updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update profile');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="settings-section">
        <h2>Profile</h2>
        <p className="muted">How you appear to teammates. Your email is also how you sign in.</p>
        <form className="settings-form" onSubmit={(event) => void onSubmit(event)}>
          <label className="mcp-field">
            <span className="mcp-field-label">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              maxLength={80}
              placeholder="Ada Lovelace"
            />
          </label>
          <label className="mcp-field">
            <span className="mcp-field-label">Role</span>
            <input
              value={role}
              onChange={(event) => setRole(event.target.value)}
              list="profile-role-suggestions"
              autoComplete="organization-title"
              maxLength={80}
              placeholder="Engineer, designer, founder…"
            />
            <datalist id="profile-role-suggestions">
              {ROLE_SUGGESTIONS.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
            <span className="mcp-field-hint">What you do. This is separate from your permission in each workspace.</span>
          </label>
          <label className="mcp-field">
            <span className="mcp-field-label">About</span>
            <textarea
              value={about}
              onChange={(event) => setAbout(event.target.value)}
              maxLength={280}
              rows={3}
              placeholder="A line or two about the work you do here."
            />
          </label>
          <label className="mcp-field">
            <span className="mcp-field-label">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          {emailChanged && hasPassword ? (
            <label className="mcp-field">
              <span className="mcp-field-label">Current password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
              <span className="mcp-field-hint">Required to change the email on a password account.</span>
            </label>
          ) : null}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="muted" role="status">
              {message}
            </p>
          ) : null}
          <Button type="submit" disabled={!ready || busy || !dirty || !email.trim()}>
            {busy ? 'Saving…' : 'Save profile'}
          </Button>
        </form>
      </div>

      <div className="settings-section">
        <h2>Workspace access</h2>
        <p className="muted">Your permission in each workspace. Owners change these from workspace settings.</p>
        {workspaces.length === 0 ? (
          <p className="muted">You are not in any workspaces yet.</p>
        ) : (
          <ul className="settings-encrypt-list">
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <strong>{workspace.name}</strong>
                <span className="muted">{titleCase(workspace.role)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
