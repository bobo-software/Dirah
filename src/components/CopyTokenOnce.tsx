import { useState } from 'react';

export default function CopyTokenOnce({
  secret,
  onCopied,
}: {
  secret: string;
  onCopied: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    setBusy(true);
    setFailed(false);
    try {
      await navigator.clipboard.writeText(secret);
      onCopied();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="copy-token-once">
      <p className="muted" role="status">
        Token created. Copy it now — it will not be shown again.
      </p>
      <button type="button" onClick={() => void copy()} disabled={busy}>
        {busy ? 'Copying…' : 'Copy token'}
      </button>
      {failed ? (
        <p className="error" role="alert">
          Could not copy. Allow clipboard access and try once more.
        </p>
      ) : null}
    </div>
  );
}
