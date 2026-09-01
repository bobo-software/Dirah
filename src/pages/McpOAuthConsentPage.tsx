import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/StoresIndex';
import { apiRequest } from '../api/client';

export function McpOAuthConsentPage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [params] = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clientId = params.get('client_id') ?? '';
  const redirectUri = params.get('redirect_uri') ?? '';
  const codeChallenge = params.get('code_challenge') ?? '';
  const state = params.get('state') ?? undefined;

  async function onApprove() {
    if (!accessToken) return;
    setBusy(true);
    try {
      const data = await apiRequest<{ redirectTo: string }>('/api/mcp/oauth/approve', {
        method: 'POST',
        accessToken,
        body: JSON.stringify({
          clientId,
          redirectUri,
          codeChallenge,
          state,
        }),
      });
      window.location.assign(data.redirectTo);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not approve');
      setBusy(false);
    }
  }

  return (
    <section className="settings-page">
      <h1>Connect Dira MCP</h1>
      <p className="muted">An MCP client wants to access markdown docs in workspaces you allowlist.</p>
      <p>
        Client: <code>{clientId || 'unknown'}</code>
      </p>
      <p>
        Redirect: <code>{redirectUri || 'missing'}</code>
      </p>
      {message ? (
        <p className="error" role="alert">
          {message}
        </p>
      ) : null}
      <button type="button" onClick={() => void onApprove()} disabled={busy || !clientId || !redirectUri}>
        {busy ? 'Redirecting…' : 'Approve'}
      </button>
    </section>
  );
}
