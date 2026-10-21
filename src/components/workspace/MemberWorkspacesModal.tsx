import { type FormEvent, useEffect, useId, useState } from 'react';
import type { MemberWorkspace } from '../../api/members';
import { useMembersStore } from '../../stores/StoresIndex';
import { Button } from '../buttons/Button';

/**
 * Visibility of one member across every workspace the signed-in user administers with them.
 * Mount with `key={member.userId}` so state starts fresh per member.
 */
export default function MemberWorkspacesModal({
  member,
  onClose,
}: {
  member: { userId: string; label: string };
  onClose: () => void;
}) {
  const workspacesForMember = useMembersStore((state) => state.workspacesForMember);
  const setWorkspacesForMember = useMembersStore((state) => state.setWorkspacesForMember);
  const titleId = useId();
  const [rows, setRows] = useState<MemberWorkspace[] | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const userId = member.userId;

  useEffect(() => {
    let cancelled = false;
    void workspacesForMember(userId)
      .then((list) => {
        if (cancelled) return;
        setRows(list);
        setVisible(Object.fromEntries(list.map((row) => [row.workspaceId, !row.hidden])));
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Could not load workspaces');
      });
    return () => {
      cancelled = true;
    };
  }, [userId, workspacesForMember]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const changed = (rows ?? []).filter((row) => visible[row.workspaceId] === row.hidden);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (changed.length === 0) return onClose();
    setBusy(true);
    setMessage(null);
    try {
      await setWorkspacesForMember(
        member.userId,
        changed.map((row) => ({ workspaceId: row.workspaceId, hidden: !visible[row.workspaceId] }))
      );
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => (!busy ? onClose() : undefined)}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>Workspaces for {member.label}</h2>
        <p className="muted">Unchecked workspaces disappear for this member. Their role is kept.</p>
        <form onSubmit={(event) => void onSubmit(event)}>
          {rows === null && !message ? <p className="muted">Loading…</p> : null}
          {rows?.length === 0 ? <p className="muted">No shared workspaces you administer.</p> : null}
          <ul className="member-workspace-list">
            {rows?.map((row) => {
              const fixed = row.role === 'owner';
              return (
                <li key={row.workspaceId}>
                  <label>
                    <input
                      type="checkbox"
                      checked={visible[row.workspaceId] ?? true}
                      disabled={fixed || busy}
                      onChange={(event) =>
                        setVisible((current) => ({ ...current, [row.workspaceId]: event.target.checked }))
                      }
                    />
                    {row.name}
                  </label>
                  <span className="muted">{fixed ? 'owner · always visible' : row.role}</span>
                </li>
              );
            })}
          </ul>
          {message ? (
            <p className="error" role="alert">
              {message}
            </p>
          ) : null}
          <div className="modal-actions">
            <Button variant="link" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || rows === null}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
