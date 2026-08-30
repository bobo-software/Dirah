import { useCallback, useEffect, useState } from 'react';
import { listSnapshots, restoreSnapshot, saveSnapshot, type PageSnapshot } from '../api/history';

export function HistoryPanel({
  pageId,
  accessToken,
  editable,
  onBeforeRestore,
  onRestored,
}: {
  pageId: string;
  accessToken: string;
  editable: boolean;
  onBeforeRestore: () => Promise<void>;
  onRestored: () => Promise<void>;
}) {
  const [snapshots, setSnapshots] = useState<PageSnapshot[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setSnapshots(await listSnapshots(accessToken, pageId));
  }, [accessToken, pageId]);

  useEffect(() => {
    void refresh().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Could not load history');
    });
  }, [refresh]);

  async function onSave() {
    setBusy(true);
    setMessage(null);
    try {
      await saveSnapshot(accessToken, pageId);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save version');
    } finally {
      setBusy(false);
    }
  }

  async function onRestore(snapshot: PageSnapshot) {
    if (
      !window.confirm(
        `Restore the version from ${formatWhen(snapshot.createdAt)}? Later edits on this page will be replaced.`
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await onBeforeRestore();
      await restoreSnapshot(accessToken, pageId, snapshot.id);
      await onRestored();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not restore version');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="history-panel">
      <div className="history-panel-head">
        <p className="muted">Saved versions of this page.</p>
        {editable ? (
          <button type="button" className="linkish" onClick={() => void onSave()} disabled={busy}>
            {busy ? 'Working…' : 'Save version'}
          </button>
        ) : null}
      </div>
      {snapshots.length === 0 ? (
        <p className="muted">No versions yet.</p>
      ) : (
        <ul className="history-list">
          {snapshots.map((snapshot) => (
            <li key={snapshot.id}>
              <div>
                <p className="history-when">{formatWhen(snapshot.createdAt)}</p>
                <p className="history-preview">{snapshot.preview || '(empty)'}</p>
              </div>
              {editable ? (
                <button
                  type="button"
                  className="linkish"
                  onClick={() => void onRestore(snapshot)}
                  disabled={busy}
                >
                  Restore
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {message ? (
        <p className="error" role="alert">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
