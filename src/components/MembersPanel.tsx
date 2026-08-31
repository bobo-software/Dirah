import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  inviteMember,
  listMembers,
  removeMember,
  revokeInvite,
  setMemberRole,
  type PublicInvite,
  type PublicMember,
} from '../api/members';

export default function MembersPanel({
  workspaceId,
  accessToken,
}: {
  workspaceId: string;
  accessToken: string;
}) {
  const [members, setMembers] = useState<PublicMember[]>([]);
  const [invites, setInvites] = useState<PublicInvite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [message, setMessage] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const data = await listMembers(accessToken, workspaceId);
    setMembers(data.members);
    setInvites(data.invites ?? []);
  }, [accessToken, workspaceId]);

  useEffect(() => {
    void refresh().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Could not load members');
    });
  }, [refresh]);

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

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await inviteMember(accessToken, workspaceId, email, role);
      if (result.member) {
        setEmail('');
        await refresh();
      } else if (result.invite) {
        setEmail('');
        await copyUrl(result.invite.inviteUrl);
        await refresh();
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
      <ul className="member-list">
        {members.map((member) => (
          <li key={member.userId}>
            <span className="member-email">{member.email}</span>
            <select
              aria-label={`Role for ${member.email}`}
              value={member.role}
              onChange={(event) => {
                void setMemberRole(accessToken, workspaceId, member.userId, event.target.value)
                  .then(refresh)
                  .catch((error: unknown) => {
                    setMessage(error instanceof Error ? error.message : 'Could not change role');
                  });
              }}
            >
              <option value="owner">owner</option>
              <option value="editor">editor</option>
              <option value="viewer">viewer</option>
            </select>
            <button
              type="button"
              className="linkish danger"
              onClick={() => {
                void removeMember(accessToken, workspaceId, member.userId)
                  .then(refresh)
                  .catch((error: unknown) => {
                    setMessage(error instanceof Error ? error.message : 'Could not remove');
                  });
              }}
            >
              Remove
            </button>
          </li>
        ))}
        {invites.map((invite) => (
          <li key={invite.id} className="pending-invite">
            <span className="member-email">{invite.email}</span>
            <span className="muted">
              {invite.role} · pending
            </span>
            <button type="button" className="linkish" onClick={() => void copyUrl(invite.inviteUrl)}>
              Copy link
            </button>
            <button
              type="button"
              className="linkish danger"
              onClick={() => {
                void revokeInvite(accessToken, workspaceId, invite.id)
                  .then(refresh)
                  .catch((error: unknown) => {
                    setMessage(error instanceof Error ? error.message : 'Could not revoke');
                  });
              }}
            >
              Revoke
            </button>
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
          <option value="editor">editor</option>
          <option value="viewer">viewer</option>
        </select>
        <button type="submit" disabled={busy}>
          Invite
        </button>
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
    </div>
  );
}
