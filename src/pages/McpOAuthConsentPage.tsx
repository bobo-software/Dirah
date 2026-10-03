import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore, useWorkspaceStore } from '../stores/StoresIndex';
import { answerOAuthRequest, getOAuthClient, type OAuthClientInfo } from '../api/mcp';
import { TokenAccessFields, type TokenAccessValue } from '../components/ComponentsIndex';

export function McpOAuthConsentPage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const fetchWorkspaces = useWorkspaceStore((state) => state.fetchWorkspaces);
  const [params] = useSearchParams();
  const clientId = params.get('client_id') ?? '';
  const redirectUri = params.get('redirect_uri') ?? '';

  const [client, setClient] = useState<OAuthClientInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Only what the user changed; everything else falls back to the read-only default below.
  const [overrides, setOverrides] = useState<Map<string, TokenAccessValue>>(new Map());

  const grantable = useMemo(
    () => workspaces.filter((w) => !w.encrypted),
    [workspaces]
  );
  const encryptedCount = workspaces.length - grantable.length;
  const missingParams = !clientId || !redirectUri;

  // Start with read-only access to every workspace the app is allowed to reach.
  const access = useMemo(() => {
    const next = new Map<string, TokenAccessValue>(
      grantable.filter((w) => w.mcpEnabled !== false).map((w) => [w.id, { allowlisted: true, canWrite: false }])
    );
    for (const [id, value] of overrides) next.set(id, value);
    return next;
  }, [grantable, overrides]);

  useEffect(() => {
    void fetchWorkspaces().catch(() => undefined);
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (!accessToken || missingParams) return;
    void getOAuthClient(accessToken, clientId, redirectUri)
      .then(setClient)
      .catch((error: unknown) =>
        setLoadError(error instanceof Error ? error.message : 'Could not load this connection request')
      );
  }, [accessToken, clientId, redirectUri, missingParams]);

  const chosen = Array.from(access.entries())
    .filter(([, v]) => v.allowlisted)
    .map(([workspaceId, v]) => ({ workspaceId, canWrite: v.canWrite }));

  function onAccessChange(id: string, patch: Partial<TokenAccessValue>) {
    const current = access.get(id) ?? { allowlisted: false, canWrite: false };
    setOverrides((prev) => new Map(prev).set(id, { ...current, ...patch }));
  }

  async function respond(deny: boolean) {
    if (!accessToken) return;
    setBusy(true);
    setMessage(null);
    try {
      const { redirectTo } = await answerOAuthRequest(accessToken, {
        clientId,
        redirectUri,
        codeChallenge: params.get('code_challenge') ?? undefined,
        state: params.get('state') ?? undefined,
        resource: params.get('resource') ?? undefined,
        scope: params.get('scope') ?? undefined,
        deny,
        workspaces: deny ? undefined : chosen,
      });
      window.location.assign(redirectTo);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not complete the connection');
      setBusy(false);
    }
  }

  const error = missingParams ? 'This link is missing details from the app that sent you here.' : loadError;
  if (error) {
    return (
      <section className="settings-page mcp-create-page">
        <h1>Can't connect this app</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <p className="muted">Go back to your AI app, remove the Dirah connector, and add it again.</p>
      </section>
    );
  }

  if (!client) {
    return (
      <section className="settings-page mcp-create-page">
        <p className="muted">Loading…</p>
      </section>
    );
  }

  return (
    <section className="settings-page mcp-create-page">
      <h1>Connect {client.clientName} to Dirah</h1>
      <p className="muted mcp-create-lede">
        <strong>{client.clientName}</strong> wants to search and read your Dirah docs and notes. Choose what it can
        reach. You can change this or disconnect at any time in Settings.
      </p>

      {message ? (
        <p className="error" role="alert">
          {message}
        </p>
      ) : null}

      <div className="mcp-field">
        <span className="mcp-field-label">Workspace access</span>
        <span className="mcp-field-hint">
          Pick "Read &amp; write" only if you want {client.clientName} to create and edit pages for you.
        </span>
        {grantable.length === 0 ? (
          <p className="muted">You don't have any workspaces that can be shared with AI apps.</p>
        ) : (
          <TokenAccessFields workspaces={grantable} value={access} onChange={onAccessChange} />
        )}
        {encryptedCount > 0 ? (
          <span className="mcp-field-hint">
            {encryptedCount} end-to-end encrypted workspace{encryptedCount === 1 ? '' : 's'} can't be shared with AI
            apps.
          </span>
        ) : null}
      </div>

      <p className="mcp-field-hint">
        After you allow access, you'll go back to <strong>{client.redirectHost}</strong>.
      </p>

      <div className="mcp-consent-actions">
        <button
          type="button"
          className="mcp-create-submit"
          onClick={() => void respond(false)}
          disabled={busy || chosen.length === 0}
        >
          {busy ? 'Connecting…' : 'Allow access'}
        </button>
        <button type="button" className="linkish" onClick={() => void respond(true)} disabled={busy}>
          Cancel
        </button>
      </div>
    </section>
  );
}
