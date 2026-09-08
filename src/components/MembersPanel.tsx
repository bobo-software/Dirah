import { type FormEvent, useEffect, useState } from 'react';
import { EMPTY_INVITES, EMPTY_MEMBERS, useMembersStore } from '../stores/StoresIndex';

export default function MembersPanel({ workspaceId }: { workspaceId: string }) {
  const members = useMembersStore((state) => state.byWorkspace[workspaceId]?.members ?? EMPTY_MEMBERS);
  const invites = useMembersStore((state) => state.byWorkspace[workspaceId]?.invites ?? EMPTY_INVITES);
  const fetchMembers = useMembersStore((state) => state.fetchMembers);
  const inviteMember = useMembersStore((state) => state.inviteMember);
  const revokeInvite = useMembersStore((state) => state.revokeInvite);
  const setMemberRole = useMembersStore((state) => state.setMemberRole);
  const removeMember = useMembersStore((state) => state.removeMember);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [message, setMessage] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchMembers(workspaceId).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Could not load members');
    });
  }, [workspaceId, fetchMembers]);

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
      <ul className="member-list">
        {members.map((member) => (
          <li key={member.userId}>
            <span className="member-email">{member.email}</span>
            <select
              aria-label={`Role for ${member.email}`}
              value={member.role}
              onChange={(event) => {
                void setMemberRole(workspaceId, member.userId, event.target.value).catch((error: unknown) => {
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
                void removeMember(workspaceId, member.userId).catch((error: unknown) => {
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
                void revokeInvite(workspaceId, invite.id).catch((error: unknown) => {
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
