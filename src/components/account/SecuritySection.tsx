import { useEffect, useState, type FormEvent } from 'react';
import { getMyCrypto, type UserCryptoBundle } from '../../api/crypto';
import {
  encryptWorkspace,
  isUnlocked,
  provisionAccount,
  rewrapAccountKey,
  useEncryptionStore,
} from '../../crypto/workspaceCrypto';
import { useAuthStore, useWorkspaceStore } from '../../stores/StoresIndex';

export function SecuritySection() {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const changePassword = useAuthStore((state) => state.changePassword);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const fetchWorkspaces = useWorkspaceStore((state) => state.fetchWorkspaces);
  const unlocked = useEncryptionStore((state) => state.unlocked);
  const lockingWorkspaceId = useEncryptionStore((state) => state.lockingWorkspaceId);

  const [cryptoBundle, setCryptoBundle] = useState<UserCryptoBundle | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [encryptError, setEncryptError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [encryptingId, setEncryptingId] = useState<string | null>(null);
  const [ready, setReady] = useState(user?.hasPassword !== undefined);

  const hasPassword = user?.hasPassword === true;
  const needsCurrentPassword = hasPassword || Boolean(cryptoBundle);

  useEffect(() => {
    void refreshUser()
      .catch(() => undefined)
      .finally(() => setReady(true));
    void fetchWorkspaces().catch(() => undefined);
  }, [refreshUser, fetchWorkspaces]);

  useEffect(() => {
    if (!accessToken) return;
    void getMyCrypto(accessToken)
      .then(setCryptoBundle)
      .catch(() => setCryptoBundle(null));
  }, [accessToken]);

  async function onChangePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    setBusy(true);
    try {
      const crypto = cryptoBundle ? await rewrapAccountKey(currentPassword, newPassword, cryptoBundle) : undefined;
      await changePassword(needsCurrentPassword ? currentPassword : undefined, newPassword, crypto);
      if (crypto) setCryptoBundle(crypto);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage(hasPassword ? 'Password updated.' : 'Password set. You can sign in with it as well.');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Could not update password');
    } finally {
      setBusy(false);
    }
  }

  async function onEncrypt(workspaceId: string) {
    if (!accessToken) return;
    setEncryptError(null);
    setEncryptingId(workspaceId);
    try {
      if (!isUnlocked()) {
        if (!passphrase) {
          setEncryptError('Enter your password to encrypt pages.');
          return;
        }
        await provisionAccount(accessToken, passphrase);
        setPassphrase('');
      }
      await encryptWorkspace(accessToken, workspaceId);
      await fetchWorkspaces(true);
    } catch (err) {
      setEncryptError(err instanceof Error ? err.message : 'Could not encrypt pages');
    } finally {
      setEncryptingId(null);
    }
  }

  const ownedPlain = workspaces.filter((workspace) => workspace.role === 'owner' && !workspace.encrypted);

  return (
    <>
      <div className="settings-section">
        <h2>Password</h2>
        <p className="muted">
          {!ready
            ? 'Loading…'
            : hasPassword
              ? 'Changing your password signs out other sessions. If you encrypt pages, the key is re-wrapped with the new password.'
              : 'This account signs in with Google or GitHub. Set a password if you also want to sign in with email.'}
        </p>
        <form className="settings-form" onSubmit={(event) => void onChangePassword(event)}>
          {needsCurrentPassword ? (
            <label className="mcp-field">
              <span className="mcp-field-label">Current password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </label>
          ) : null}
          <label className="mcp-field">
            <span className="mcp-field-label">New password</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
            <span className="mcp-field-hint">At least 8 characters.</span>
          </label>
          <label className="mcp-field">
            <span className="mcp-field-label">Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>
          {passwordError ? (
            <p className="error" role="alert">
              {passwordError}
            </p>
          ) : null}
          {passwordMessage ? (
            <p className="muted" role="status">
              {passwordMessage}
            </p>
          ) : null}
          <button type="submit" disabled={!ready || busy || newPassword.length < 8}>
            {busy ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
          </button>
        </form>
      </div>

      <div className="settings-section">
        <h2>Encryption</h2>
        <p className="muted">
          Encrypt page bodies in your browser before they are saved. Titles stay visible. This cannot be turned off,
          and it uses your account password.
        </p>
        {ownedPlain.length > 0 && !unlocked ? (
          <label className="mcp-field">
            <span className="mcp-field-label">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder="Account password"
              aria-label="Password to encrypt pages"
            />
            <span className="mcp-field-hint">Needed once in this tab to unlock encryption.</span>
          </label>
        ) : null}
        {workspaces.length === 0 ? (
          <p className="muted">You are not in any workspaces yet.</p>
        ) : (
          <ul className="settings-encrypt-list">
            {workspaces.map((workspace) => {
              const owner = workspace.role === 'owner';
              const sealing = encryptingId === workspace.id || lockingWorkspaceId === workspace.id;
              return (
                <li key={workspace.id}>
                  <span>
                    <strong>{workspace.name}</strong>
                    <span className="muted">
                      {' '}
                      {owner ? 'Owner' : workspace.role.charAt(0).toUpperCase() + workspace.role.slice(1)}
                    </span>
                  </span>
                  {workspace.encrypted ? (
                    <span className="kind-chip">Encrypted</span>
                  ) : owner ? (
                    <button type="button" disabled={sealing} onClick={() => void onEncrypt(workspace.id)}>
                      {sealing ? 'Encrypting…' : 'Encrypt pages'}
                    </button>
                  ) : (
                    <span className="muted">Only the owner can encrypt</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {encryptError ? (
          <p className="error" role="alert">
            {encryptError}
          </p>
        ) : null}
      </div>
    </>
  );
}
