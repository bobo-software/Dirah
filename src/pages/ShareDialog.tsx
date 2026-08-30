import { useEffect, useState } from 'react';
import { createShare, getShare, revokeShare } from '../api/share';

export function ShareDialog({
  pageId,
  accessToken,
  encrypted,
}: {
  pageId: string;
  accessToken: string;
  encrypted?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || encrypted) return;
    void getShare(accessToken, pageId)
      .then((share) => {
        setUrl(share ? `${window.location.origin}/s/${share.token}` : null);
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : 'Could not load share link');
      });
  }, [accessToken, open, pageId, encrypted]);

  async function onCreate() {
    setBusy(true);
    setMessage(null);
    try {
      const share = await createShare(accessToken, pageId);
      setUrl(`${window.location.origin}/s/${share.token}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create link');
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke() {
    setBusy(true);
    setMessage(null);
    try {
      await revokeShare(accessToken, pageId);
      setUrl(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not revoke');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="share-dialog">
      <button type="button" className="linkish" onClick={() => setOpen((value) => !value)}>
        Share
      </button>
      {open ? (
        <div className="share-pop">
          {encrypted ? (
            <p className="muted">Public links are off while this workspace is encrypted.</p>
          ) : url ? (
            <>
              <input aria-label="Share link" readOnly value={url} />
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(url);
                }}
              >
                Copy
              </button>
              <button type="button" className="linkish danger" onClick={() => void onRevoke()} disabled={busy}>
                Revoke
              </button>
            </>
          ) : (
            <button type="button" onClick={() => void onCreate()} disabled={busy}>
              Create view link
            </button>
          )}
          {message ? (
            <p className="error" role="alert">
              {message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
