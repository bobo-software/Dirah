import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { API_URL } from '../api/client';
import { useMcpStore } from '../stores/StoresIndex';
import type { McpToken, TokenAccessRow } from '../api/mcp';
import type { TokenAccessValue } from '../components/TokenAccessFields';
import { CopyTokenOnce, TokenAccessFields } from '../components/ComponentsIndex';

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function rowsToValue(rows: TokenAccessRow[]): Map<string, TokenAccessValue> {
  const map = new Map<string, TokenAccessValue>();
  for (const row of rows) {
    map.set(row.workspaceId, { allowlisted: row.allowlisted, canWrite: row.canWrite });
  }
  return map;
}

export function McpTokenDetailPage() {
  const { workspaceId, tokenId } = useParams();
  const location = useLocation();
  const tokens = useMcpStore((state) => state.tokens);
  const loaded = useMcpStore((state) => state.loaded);
  const fetchAll = useMcpStore((state) => state.fetchAll);
  const fetchTokenAccess = useMcpStore((state) => state.fetchTokenAccess);
  const [loadMessage, setLoadMessage] = useState<string | null>(null);

  const token = tokens.find((item) => item.id === tokenId);
  const secretFromCreation = (location.state as { secret?: string } | null)?.secret ?? null;
  const backLink = `/w/${workspaceId}/settings?tab=mcp`;

  useEffect(() => {
    if (!loaded) {
      void fetchAll().catch((error: unknown) => {
        setLoadMessage(error instanceof Error ? error.message : 'Could not load token');
      });
    }
  }, [loaded, fetchAll]);

  useEffect(() => {
    if (!tokenId) return;
    void fetchTokenAccess(tokenId).catch((error: unknown) => {
      setLoadMessage(error instanceof Error ? error.message : 'Could not load workspace access');
    });
  }, [tokenId, fetchTokenAccess]);

  if (!token) {
    return (
      <section className="settings-page">
        <Link className="back-link" to={backLink}>
          <BackIcon />
          MCP tokens
        </Link>
        {loadMessage ? (
          <p className="error" role="alert">
            {loadMessage}
          </p>
        ) : loaded ? (
          <p className="error" role="alert">
            Token not found.
          </p>
        ) : (
          <p className="muted">Loading token…</p>
        )}
      </section>
    );
  }

  return <TokenDetailBody key={token.id} token={token} workspaceId={workspaceId ?? ''} backLink={backLink} secretFromCreation={secretFromCreation} />;
}

function TokenDetailBody({
  token,
  workspaceId,
  backLink,
  secretFromCreation,
}: {
  token: McpToken;
  workspaceId: string;
  backLink: string;
  secretFromCreation: string | null;
}) {
  const navigate = useNavigate();
  const tokenAccess = useMcpStore((state) => state.tokenAccess);
  const tokenAccessLoading = useMcpStore((state) => state.tokenAccessLoading);
  const updateToken = useMcpStore((state) => state.updateToken);
  const rotateToken = useMcpStore((state) => state.rotateToken);
  const revokeToken = useMcpStore((state) => state.revokeToken);
  const setTokenAccess = useMcpStore((state) => state.setTokenAccess);
  const rows = tokenAccess[token.id];

  const [name, setName] = useState(token.name);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shownSecret, setShownSecret] = useState<string | null>(secretFromCreation);
  const [secretNotice, setSecretNotice] = useState('Token created. Copy it now — it will not be shown again.');

  const mcpConfigSnippet = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            dirah: {
              url: `${API_URL}/mcp`,
              headers: { Authorization: `Bearer ${token.tokenPrefix}…` },
            },
          },
        },
        null,
        2
      ),
    [token.tokenPrefix]
  );

  async function onRename(event: FormEvent) {
    event.preventDefault();
    try {
      await updateToken(token.id, { name });
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not rename token');
    }
  }

  async function onAccessChange(workspaceId: string, patch: Partial<TokenAccessValue>) {
    const byId = new Map((rows ?? []).map((row) => [row.workspaceId, row]));
    const existing = byId.get(workspaceId);
    byId.set(workspaceId, {
      workspaceId,
      name: existing?.name ?? '',
      slug: existing?.slug ?? '',
      role: existing?.role ?? '',
      mcpEnabled: existing?.mcpEnabled ?? true,
      allowlisted: existing?.allowlisted ?? false,
      canWrite: existing?.canWrite ?? false,
      ...patch,
    });
    const next = Array.from(byId.values());
    try {
      await setTokenAccess(
        token.id,
        next.filter((row) => row.allowlisted).map((row) => ({ workspaceId: row.workspaceId, canWrite: row.canWrite }))
      );
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update workspace access');
    }
  }

  async function onDefaultChange(workspaceId: string) {
    try {
      await updateToken(token.id, { defaultWorkspaceId: workspaceId || null });
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update default workspace');
    }
  }

  async function onRotate() {
    if (!window.confirm('Replace this token? The current secret will stop working immediately.')) return;
    try {
      const rotated = await rotateToken(token.id);
      setShownSecret(rotated.secret);
      setSecretNotice('Token replaced. Copy the new secret now — the previous one no longer works, and this one will not be shown again.');
      setCopied(false);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not rotate token');
    }
  }

  async function onRevoke() {
    if (!window.confirm('Revoke this MCP token?')) return;
    try {
      await revokeToken(token.id);
      navigate(`/w/${workspaceId}/settings?tab=mcp`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not revoke token');
    }
  }

  const allowlisted = (rows ?? []).filter((row) => row.allowlisted);
  const snippetWorkspace =
    allowlisted.find((row) => row.workspaceId === token.defaultWorkspaceId) ??
    (allowlisted.length === 1 ? allowlisted[0] : undefined);
  const snippet = snippetWorkspace
    ? `Canonical docs: Dirah workspace \`${snippetWorkspace.slug}\`. Call dirah_guide, then search_docs before inventing APIs or duplicating existing docs.`
    : null;

  return (
    <section className="settings-page">
      <Link className="back-link" to={backLink}>
        <BackIcon />
        MCP tokens
      </Link>
      <h1>{token.name}</h1>
      <p className="muted">
        {token.tokenPrefix}… · created {new Date(token.createdAt).toLocaleDateString()}
        {token.lastUsedAt ? ` · last used ${new Date(token.lastUsedAt).toLocaleDateString()}` : ' · never used'}
      </p>
      {message ? (
        <p className="error" role="status">
          {message}
        </p>
      ) : null}

      {shownSecret ? (
        <div className="settings-section">
          <CopyTokenOnce secret={shownSecret} notice={secretNotice} onCopied={() => setCopied(true)} />
          {copied ? (
            <p className="muted" role="status">
              Token copied. It will not be shown again.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="settings-section">
        <h2>Name</h2>
        <form className="inline-form" onSubmit={(e) => void onRename(e)}>
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Token name" />
          <button type="submit" disabled={!name.trim() || name === token.name}>
            Save
          </button>
        </form>
      </div>

      <div className="settings-section">
        <h2>Workspace access</h2>
        {tokenAccessLoading[token.id] && !rows ? (
          <p className="muted">Loading workspace access…</p>
        ) : (
          <TokenAccessFields
            workspaces={(rows ?? []).map((row) => ({
              id: row.workspaceId,
              name: row.name,
              role: row.role,
              mcpEnabled: row.mcpEnabled,
            }))}
            value={rowsToValue(rows ?? [])}
            defaultWorkspaceId={token.defaultWorkspaceId}
            groupName={`token-default-workspace-${token.id}`}
            onChange={(workspaceId, patch) => void onAccessChange(workspaceId, patch)}
            onDefaultChange={(workspaceId) => void onDefaultChange(workspaceId)}
          />
        )}
      </div>

      <div className="settings-section">
        <h2>Cursor / Claude Code</h2>
        <textarea className="mcp-snippet" readOnly value={mcpConfigSnippet} />
      </div>

      {snippet ? (
        <div className="settings-section">
          <h2>CLAUDE.md / AGENTS.md snippet</h2>
          <textarea className="mcp-snippet" readOnly value={snippet} />
        </div>
      ) : null}

      <div className="settings-section">
        <h2>Danger zone</h2>
        <button type="button" onClick={() => void onRotate()}>
          Rotate token
        </button>
        <button type="button" className="danger-btn" onClick={() => void onRevoke()}>
          Revoke token
        </button>
      </div>
    </section>
  );
}
