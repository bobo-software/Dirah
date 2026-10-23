import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PUBLIC_API_URL } from '../../api/client';
import type { McpToken, TokenAccessRow } from '../../api/mcp';
import { useMcpStore } from '../../stores/StoresIndex';
import { confirmDelete } from '../layout/deleteDialogue';
import { BackIcon } from '../layout/SectionIcons';
import CopyTokenOnce from './CopyTokenOnce';
import TokenAccessFields, { type TokenAccessValue } from './TokenAccessFields';
import { Button } from '../buttons/Button';

function rowsToValue(rows: TokenAccessRow[]): Map<string, TokenAccessValue> {
  const map = new Map<string, TokenAccessValue>();
  for (const row of rows) {
    map.set(row.workspaceId, { allowlisted: row.allowlisted, canWrite: row.canWrite });
  }
  return map;
}

export function TokenDetailBody({
  token,
  backLink,
  secretFromCreation,
}: {
  token: McpToken;
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
  const isOAuth = Boolean(token.oauthClientId);

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
              url: `${PUBLIC_API_URL}/mcp`,
              headers: { Authorization: `Bearer ${token.tokenPrefix}…` },
            },
          },
        },
        null,
        2,
      ),
    [token.tokenPrefix],
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
        next.filter((row) => row.allowlisted).map((row) => ({ workspaceId: row.workspaceId, canWrite: row.canWrite })),
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
      setSecretNotice(
        'Token replaced. Copy the new secret now — the previous one no longer works, and this one will not be shown again.',
      );
      setCopied(false);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not rotate token');
    }
  }

  async function onRevoke() {
    const prompt = isOAuth
      ? `Disconnect ${token.name}? It will lose access to Dirah until you connect it again.`
      : 'Revoke this MCP token?';
    const confirmed = await confirmDelete({
      title: isOAuth ? 'Disconnect app?' : 'Revoke token?',
      message: prompt,
      confirmLabel: isOAuth ? 'Disconnect' : 'Revoke',
    });
    if (!confirmed) return;
    try {
      await revokeToken(token.id);
      navigate(backLink);
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
        {isOAuth ? 'Connected app' : `${token.tokenPrefix}…`} · created{' '}
        {new Date(token.createdAt).toLocaleDateString()}
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
        <form className="inline-form" onSubmit={(event) => void onRename(event)}>
          <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Token name" />
          <Button type="submit" disabled={!name.trim() || name === token.name}>
            Save
          </Button>
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

      {isOAuth ? null : (
        <div className="settings-section">
          <h2>Cursor / Claude Code</h2>
          <textarea className="mcp-snippet" readOnly value={mcpConfigSnippet} />
        </div>
      )}

      {snippet ? (
        <div className="settings-section">
          <h2>CLAUDE.md / AGENTS.md snippet</h2>
          <textarea className="mcp-snippet" readOnly value={snippet} />
        </div>
      ) : null}

      <div className="settings-section">
        <h2>Danger zone</h2>
        {isOAuth ? null : (
          <Button type="button" onClick={() => void onRotate()}>
            Rotate token
          </Button>
        )}
        <Button variant="danger" type="button" onClick={() => void onRevoke()}>
          {isOAuth ? 'Disconnect app' : 'Revoke token'}
        </Button>
      </div>
    </section>
  );
}
