import { type FormEvent, useEffect, useState } from 'react';
import { confirmDelete } from '../layout/deleteDialogue';
import { encryptWorkspace, isUnlocked, provisionAccount, syncMemberKeys, useEncryptionStore } from '../../crypto/workspaceCrypto';
import { EMPTY_INVITES, EMPTY_MEMBERS, useAuthStore, useMarkdownContentStore, useMembersStore, useWorkspaceStore } from '../../stores/StoresIndex';
import { Button } from '../buttons/Button';
import MemberWorkspacesModal from './MemberWorkspacesModal';

/** Owners and admins see this panel; `owner` unlocks encryption and owner rows. */
export default function MembersPanel({ workspaceId, owner }: { workspaceId: string; owner: boolean }) {
  const members = useMembersStore((state) => state.byWorkspace[workspaceId]?.members ?? EMPTY_MEMBERS);
  const invites = useMembersStore((state) => state.byWorkspace[workspaceId]?.invites ?? EMPTY_INVITES);
  const fetchMembers = useMembersStore((state) => state.fetchMembers);
  const inviteMember = useMembersStore((state) => state.inviteMember);
  const revokeInvite = useMembersStore((state) => state.revokeInvite);
  const setMemberRole = useMembersStore((state) => state.setMemberRole);
  const removeMember = useMembersStore((state) => state.removeMember);
  const setMemberHidden = useMembersStore((state) => state.setMemberHidden);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [workspacesFor, setWorkspacesFor] = useState<{ userId: string; label: string } | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [message, setMessage] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [sealError, setSealError] = useState<string | null>(null);
  const accessToken = useAuthStore((state) => state.accessToken);
  const workspace = useWorkspaceStore((state) => state.workspaces.find((item) => item.id === workspaceId));
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);
  const unlocked = useEncryptionStore((state) => state.unlocked);
  const locking = useEncryptionStore((state) => state.lockingWorkspaceId === workspaceId);
  const encrypted = Boolean(workspace?.encrypted);

  useEffect(() => {
    void fetchMembers(workspaceId).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Could not load members');
    });
  }, [workspaceId, fetchMembers]);

  useEffect(() => {
    if (!accessToken || !encrypted || !unlocked) return;
    void syncMemberKeys(accessToken, workspaceId).catch(() => undefined);
  }, [accessToken, encrypted, unlocked, workspaceId, members]);

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setMessage('Invite link copied.');
    } catch {
      setCopiedUrl(url);
      setMessage('Copy the invite link below.');
    }
  }

  async function onEncrypt(password?: string) {
    if (!accessToken) return;
    setBusy(true);
    setSealError(null);
    setMessage(null);
    try {
      if (!isUnlocked()) {
        if (!password) {
          setSealError('Enter your password to encrypt pages.');
          return;
        }
        await provisionAccount(accessToken, password);
      }
      await encryptWorkspace(accessToken, workspaceId);
      useMarkdownContentStore.getState().clearAll();
      await setActiveWorkspace(workspaceId);
      setPassphrase('');
    } catch (error) {
      setSealError(error instanceof Error ? error.message : 'Could not encrypt pages');
    } finally {
      setBusy(false);
    }
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await inviteMember(workspaceId, email, role);
      if (result.invite) {
        setEmail('');
        await copyUrl(result.invite.inviteUrl);
        setMessage(result.invite.mailed ? 'Invite emailed. Link also copied.' : 'Invite created. Link copied.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not invite');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-section-head">
        <h2>Members</h2>
      </div>
      {encrypted && !sealError ? (
        <p className="muted">Pages are encrypted. Search, Ask, and public share are off for this workspace.</p>
      ) : owner ? (
        <form
          className="invite-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onEncrypt(isUnlocked() ? undefined : passphrase);
          }}
        >
          <p className="muted">
            Encrypt page bodies in this browser. This cannot be turned off. Titles stay visible.
          </p>
          {encrypted ? <p className="muted">Finish sealing pages that are still plaintext.</p> : null}
          {!unlocked ? (
            <input
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder="Account password"
              aria-label="Password to encrypt pages"
              autoComplete="current-password"
              required
            />
          ) : null}
          <Button type="submit" disabled={busy || locking}>
            {locking || busy ? 'Encrypting pages…' : encrypted ? 'Finish encrypting pages' : 'Encrypt pages'}
          </Button>
          {sealError ? (
            <p className="error" role="alert">
              {sealError}
            </p>
          ) : null}
        </form>
      ) : null}
      <ul className="member-list">
        {members.map((member) => {
          const locked = !owner && member.role === 'owner';
          const label = member.name?.trim() || member.email;
          const self = member.userId === currentUserId;
          return (
            <li key={member.userId} className={member.hidden ? 'member-row member-hidden' : 'member-row'}>
              <span className="member-email">
                {member.name?.trim() ? (
                  <>
                    {member.name}
                    {member.hidden ? <span className="member-hidden-tag">hidden</span> : null}
                    <span className="member-email-sub">{member.email}</span>
                  </>
                ) : (
                  <>
                    {member.email}
                    {member.hidden ? <span className="member-hidden-tag">hidden</span> : null}
                  </>
                )}
              </span>
              {self || member.role === 'owner' ? (
                <span />
              ) : (
                <label className="member-visibility" title="Hidden members keep their role but can't see or open this workspace">
                  <input
                    type="checkbox"
                    checked={!member.hidden}
                    aria-label={`${label} can see this workspace`}
                    onChange={(event) => {
                      void setMemberHidden(workspaceId, member.userId, !event.target.checked).catch((error: unknown) => {
                        setMessage(error instanceof Error ? error.message : 'Could not change visibility');
                      });
                    }}
                  />
                  Can see
                </label>
              )}
              {locked ? (
                <span className="muted">owner</span>
              ) : (
                <select
                  aria-label={`Role for ${member.email}`}
                  value={member.role}
                  onChange={(event) => {
                    void setMemberRole(workspaceId, member.userId, event.target.value).catch((error: unknown) => {
                      setMessage(error instanceof Error ? error.message : 'Could not change role');
                    });
                  }}
                >
                  {owner ? <option value="owner">owner</option> : null}
                  <option value="admin">admin</option>
                  <option value="editor">editor</option>
                  <option value="viewer">viewer</option>
                </select>
              )}
              {self ? (
                <span />
              ) : (
                <Button variant="link" type="button" onClick={() => setWorkspacesFor({ userId: member.userId, label })}>
                  Workspaces…
                </Button>
              )}
              {locked ? null : (
                <Button variant="link"
                  type="button"
                  className="danger"
                  onClick={() => {
                    void confirmDelete({
                      title: 'Remove member?',
                      message: `Remove ${label} from this workspace?`,
                      confirmLabel: 'Remove',
                    }).then((confirmed) => {
                      if (!confirmed) return;
                      void removeMember(workspaceId, member.userId).catch((error: unknown) => {
                        setMessage(error instanceof Error ? error.message : 'Could not remove');
                      });
                    });
                  }}
                >
                  Remove
                </Button>
              )}
            </li>
          );
        })}
        {invites.map((invite) => (
          <li key={invite.id} className="pending-invite">
            <span className="member-email">{invite.email}</span>
            <span className="muted">
              {invite.role} · pending
            </span>
            <Button variant="link" type="button" onClick={() => void copyUrl(invite.inviteUrl)}>
              Copy link
            </Button>
            <Button variant="link"
              type="button"
              className="danger"
              onClick={() => {
                void confirmDelete({
                  title: 'Revoke invite?',
                  message: `Revoke the invite for ${invite.email}?`,
                  confirmLabel: 'Revoke',
                }).then((confirmed) => {
                  if (!confirmed) return;
                  void revokeInvite(workspaceId, invite.id).catch((error: unknown) => {
                    setMessage(error instanceof Error ? error.message : 'Could not revoke');
                  });
                });
              }}
            >
              Revoke
            </Button>
          </li>
        ))}
      </ul>
      <form className="invite-form inline-form" onSubmit={(event) => void onInvite(event)}>
        <input
          type="email"
          placeholder="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          aria-label="Invite email"
        />
        <select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Invite role">
          <option value="admin">admin</option>
          <option value="editor">editor</option>
          <option value="viewer">viewer</option>
        </select>
        <Button type="submit" disabled={busy}>
          Invite
        </Button>
      </form>
      {copiedUrl ? (
        <input
          className="invite-url"
          readOnly
          value={copiedUrl}
          aria-label="Invite link"
          onFocus={(event) => event.currentTarget.select()}
        />
      ) : null}
      {message ? (
        <p className={copiedUrl && message.includes('copied') ? 'muted' : 'error'} role="alert">
          {message}
        </p>
      ) : null}
      {workspacesFor ? (
        <MemberWorkspacesModal
          key={workspacesFor.userId}
          member={workspacesFor}
          onClose={() => setWorkspacesFor(null)}
        />
      ) : null}
    </div>
  );
}
