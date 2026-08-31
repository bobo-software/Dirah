import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { API_URL } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import {
  createMcpToken,
  listMcpAccess,
  listMcpTokens,
  revokeMcpToken,
  setMcpAccess,
  setWorkspaceMcpEnabled,
  updateMcpToken,
  type McpAccessRow,
  type McpToken,
} from '../api/mcp';
import { CopyTokenOnce, MembersPanel } from '../components/ComponentsIndex';
import { canAdmin, type WorkspaceOutlet } from './workspaceContext';

export function SettingsPage() {
  const { accessToken } = useAuth();
  const { workspaceId, role } = useOutletContext<WorkspaceOutlet>();
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [access, setAccess] = useState<McpAccessRow[]>([]);
  const [name, setName] = useState('Cursor');
  const [newTokenDefaultWorkspaceId, setNewTokenDefaultWorkspaceId] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const owner = canAdmin(role);

  async function refresh() {
    if (!accessToken) return;
    const [nextTokens, nextAccess] = await Promise.all([
      listMcpTokens(accessToken),
      listMcpAccess(accessToken),
    ]);
    setTokens(nextTokens);
    setAccess(nextAccess);
  }

  useEffect(() => {
    void refresh().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Could not load settings');
    });
  }, [accessToken]);

  const snippet = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            dira: {
              url: `${API_URL}/mcp`,
              headers: { Authorization: 'Bearer dira_mcp_…' },
            },
          },
        },
        null,
        2
      ),
    []
  );

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setBusy(true);
    setCopied(false);
    try {
      const token = await createMcpToken(accessToken, name, newTokenDefaultWorkspaceId || undefined);
      setSecret(token.secret ?? null);
      setMessage(null);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create token');
    } finally {
      setBusy(false);
    }
  }

  async function onSetDefaultWorkspace(tokenId: string, defaultWorkspaceId: string) {
    if (!accessToken) return;
    try {
      await updateMcpToken(accessToken, tokenId, { defaultWorkspaceId: defaultWorkspaceId || null });
      setMessage(null);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update default workspace');
    }
  }

  function agentSnippet(token: McpToken): string | null {
    const allowlisted = access.filter((row) => row.allowlisted);
    const workspace =
      allowlisted.find((row) => row.workspaceId === token.defaultWorkspaceId) ??
      (allowlisted.length === 1 ? allowlisted[0] : undefined);
    if (!workspace) return null;
    return `Canonical docs: Dira workspace \`${workspace.slug}\`. Call dira_guide, then search_docs before inventing APIs or duplicating existing docs.`;
  }

  async function onRevoke(id: string) {
    if (!accessToken) return;
    if (!window.confirm('Revoke this MCP token?')) return;
    await revokeMcpToken(accessToken, id);
    setSecret(null);
    setCopied(false);
    await refresh();
  }

  async function onToggle(row: McpAccessRow, field: 'allowlisted' | 'canWrite', value: boolean) {
    if (!accessToken) return;
    const next = access.map((item) => {
      if (item.workspaceId !== row.workspaceId) return item;
      if (field === 'allowlisted') {
        return { ...item, allowlisted: value, canWrite: value ? item.canWrite : false };
      }
      return { ...item, canWrite: value };
    });
    setAccess(next);
    try {
      const saved = await setMcpAccess(
        accessToken,
        next
          .filter((item) => item.allowlisted)
          .map((item) => ({ workspaceId: item.workspaceId, canWrite: item.canWrite }))
      );
      setAccess(saved);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update allowlist');
      await refresh();
    }
  }

  return (
    <section className="settings-page">
      <h1>Settings</h1>
      <p className="muted">Workspace members and MCP access for coding agents.</p>
      {message ? (
        <p className="error" role="status">
          {message}
        </p>
      ) : null}

      {owner && accessToken ? (
        <MembersPanel
          workspaceId={workspaceId}
          accessToken={accessToken}
        />
      ) : null}

      <div className="settings-section">
        <h2>MCP tokens</h2>
        <form className="inline-form" onSubmit={(e) => void onCreate(e)}>
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Token name" />
          <select
            aria-label="Default workspace"
            value={newTokenDefaultWorkspaceId}
            onChange={(e) => setNewTokenDefaultWorkspaceId(e.target.value)}
          >
            <option value="">No default workspace</option>
            {access
              .filter((row) => row.allowlisted)
              .map((row) => (
                <option key={row.workspaceId} value={row.workspaceId}>
                  {row.name}
                </option>
              ))}
          </select>
          <button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create token'}
          </button>
        </form>
        {secret ? (
          <CopyTokenOnce
            secret={secret}
            onCopied={() => {
              setSecret(null);
              setCopied(true);
            }}
          />
        ) : null}
        {copied ? (
          <p className="muted" role="status">
            Token copied. It will not be shown again.
          </p>
        ) : null}
        {tokens.length === 0 ? <p className="muted">No active tokens.</p> : null}
        {tokens.map((token) => (
          <div className="settings-row settings-row-token" key={token.id}>
            <div>
              <strong>{token.name}</strong>
              <p className="muted">{token.tokenPrefix}…</p>
              <label className="sidebar-label" htmlFor={`default-ws-${token.id}`}>
                Default workspace
              </label>
              <select
                id={`default-ws-${token.id}`}
                value={token.defaultWorkspaceId ?? ''}
                onChange={(e) => void onSetDefaultWorkspace(token.id, e.target.value)}
              >
                <option value="">No default workspace</option>
                {access
                  .filter((row) => row.allowlisted)
                  .map((row) => (
                    <option key={row.workspaceId} value={row.workspaceId}>
                      {row.name}
                    </option>
                  ))}
              </select>
              {agentSnippet(token) ? (
                <>
                  <label className="sidebar-label" htmlFor={`agent-snippet-${token.id}`}>
                    CLAUDE.md / AGENTS.md snippet
                  </label>
                  <textarea
                    id={`agent-snippet-${token.id}`}
                    className="mcp-snippet"
                    readOnly
                    value={agentSnippet(token) ?? ''}
                  />
                </>
              ) : null}
            </div>
            <button type="button" className="linkish danger" onClick={() => void onRevoke(token.id)}>
              Revoke
            </button>
          </div>
        ))}
        <label className="sidebar-label" htmlFor="mcp-snippet">
          Cursor / Claude Code
        </label>
        <textarea id="mcp-snippet" className="mcp-snippet" readOnly value={snippet} />
      </div>

      <div className="settings-section">
        <h2>Workspace access</h2>
        {access.map((row) => (
          <div className="settings-row" key={row.workspaceId}>
            <div>
              <strong>{row.name}</strong>
              <p className="muted">
                {row.role}
                {row.encrypted ? ' · encrypted' : ''}
                {row.mcpEnabled === false ? ' · MCP off' : ''}
              </p>
            </div>
            <label>
              <input
                type="checkbox"
                checked={row.mcpEnabled !== false}
                disabled={row.role !== 'owner'}
                onChange={(e) => {
                  if (!accessToken || row.role !== 'owner') return;
                  void setWorkspaceMcpEnabled(accessToken, row.workspaceId, e.target.checked)
                    .then(() => refresh())
                    .catch((error: unknown) => {
                      setMessage(error instanceof Error ? error.message : 'Could not update workspace');
                    });
                }}
              />{' '}
              Enabled
            </label>
            <label>
              <input
                type="checkbox"
                checked={row.allowlisted}
                disabled={row.encrypted || row.mcpEnabled === false}
                onChange={(e) => void onToggle(row, 'allowlisted', e.target.checked)}
              />{' '}
              MCP
            </label>
            <label>
              <input
                type="checkbox"
                checked={row.canWrite}
                disabled={!row.allowlisted || row.role === 'viewer' || row.encrypted}
                onChange={(e) => void onToggle(row, 'canWrite', e.target.checked)}
              />{' '}
              Write
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}
