import { useEffect, useState } from 'react';
import { useSync } from '../sync/SyncProvider';
import { useFollow } from '../sync/FollowContext';
import type { PresencePeer } from '../sync/protocol';

export function PresencePanel({ pageOpen }: { pageOpen: boolean }) {
  const { client } = useSync();
  const { followingId, follow } = useFollow();
  const [peers, setPeers] = useState<PresencePeer[]>([]);

  useEffect(() => client.onPresence(setPeers), [client]);

  useEffect(() => {
    if (followingId == null || peers.length === 0) return;
    if (!peers.some((peer) => peer.clientId === followingId && !peer.self)) {
      follow(null);
    }
  }, [peers, followingId, follow]);

  if (!pageOpen) return null;

  return (
    <section className="presence-panel">
      <p className="sidebar-label">On this page</p>
      {peers.length === 0 ? (
        <p className="muted">Connecting…</p>
      ) : (
        <ul className="presence-list">
          {peers.map((peer) => {
            const following = followingId === peer.clientId;
            return (
              <li key={peer.clientId}>
                <span
                  className={`presence-dot ${peer.idle ? 'idle' : 'active'}`}
                  style={peer.color ? { background: peer.color } : undefined}
                />
                <span className="presence-name">
                  {peer.name}
                  {peer.self ? ' (you)' : ''}
                </span>
                <span className="muted">{peer.idle ? 'Idle' : 'Active'}</span>
                {peer.self ? null : (
                  <button
                    type="button"
                    className={`linkish${following ? ' on' : ''}`}
                    onClick={() => follow(following ? null : peer.clientId)}
                  >
                    {following ? 'Following' : 'Follow'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
