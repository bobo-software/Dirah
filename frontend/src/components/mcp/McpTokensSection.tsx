import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PUBLIC_API_URL } from '../../api/client';
import type { McpToken, TokenAccessRow } from '../../api/mcp';
import { confirmDelete } from '../layout/deleteDialogue';
import { useMcpStore } from '../../stores/StoresIndex';
import { Button } from '../buttons/Button';

function KebabIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function initialOf(name: string): string {
  return (name.trim().charAt(0) || '?').toUpperCase();
}

const CHIP_LIMIT = 3;

function TokenWorkspaces({
  rows,
  loading,
  currentWorkspaceId,
}: {
  rows: TokenAccessRow[] | undefined;
  loading: boolean;
  currentWorkspaceId?: string;
}) {
  if (loading && !rows) {
    return <span className="muted token-workspaces-loading">Loading…</span>;
  }
  const granted = (rows ?? []).filter((row) => row.allowlisted);
  if (granted.length === 0) {
    return <span className="muted">No workspaces granted</span>;
  }
  const shown = granted.slice(0, CHIP_LIMIT);
  const overflow = granted.length - shown.length;
  const hereGranted = currentWorkspaceId
    ? granted.some((row) => row.workspaceId === currentWorkspaceId)
    : true;

  return (
    <div className="token-workspaces">
      <span className="token-workspace-chips">
        {shown.map((row) => (
          <span
            key={row.workspaceId}
            className={
              row.workspaceId === currentWorkspaceId ? 'workspace-avatar-sm current' : 'workspace-avatar-sm'
            }
            title={row.name}
          >
            {initialOf(row.name)}
          </span>
        ))}
        {overflow > 0 ? <span className="workspace-avatar-sm more">+{overflow}</span> : null}
      </span>
      {!hereGranted ? <span className="muted token-workspaces-note">Not granted here</span> : null}
    </div>
  );
}

function TokenRow({
  token,
  currentWorkspaceId,
  tokenPath,
  accessRows,
  accessLoading,
  onRevoke,
}: {
  token: McpToken;
  currentWorkspaceId?: string;
  tokenPath: string;
  accessRows: TokenAccessRow[] | undefined;
  accessLoading: boolean;
  onRevoke: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuTriggerRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  function open() {
    navigate(tokenPath);
  }

  return (
    <tr
      className="mcp-table-row"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      <td className="mcp-table-name">{token.name}</td>
      <td>
        {token.oauthClientId ? (
          <span className="muted">Connected app</span>
        ) : (
          <code className="mcp-table-token">{token.tokenPrefix}…</code>
        )}
      </td>
      <td>
        <TokenWorkspaces rows={accessRows} loading={accessLoading} currentWorkspaceId={currentWorkspaceId} />
      </td>
      <td className="muted">{formatDate(token.createdAt)}</td>
      <td className="muted">{token.lastUsedAt ? formatDate(token.lastUsedAt) : 'Never'}</td>
      <td className="mcp-table-actions" onClick={(e) => e.stopPropagation()}>
        <span className={menuOpen ? 'page-row-menu open' : 'page-row-menu'} ref={menuRef}>
          <Button variant="link"
            type="button"
            ref={menuTriggerRef}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <KebabIcon />
          </Button>
          {menuOpen ? (
            <div className="page-row-dropdown" role="menu">
              <Button variant="plain"
                type="button"
                role="menuitem"
                className="page-row-dropdown-item danger"
                onClick={() => {
                  setMenuOpen(false);
                  onRevoke(token.id);
                }}
              >
                Revoke
              </Button>
            </div>
          ) : null}
        </span>
      </td>
    </tr>
  );
}

function tokenGrantedTo(rows: TokenAccessRow[] | undefined, workspaceId: string): boolean {
  return (rows ?? []).some((row) => row.workspaceId === workspaceId && row.allowlisted);
}

export function McpTokensSection({
  workspaceId,
  newTokenPath,
  tokenPath,
  description,
  emptyMessage,
}: {
  /** When set, only tokens allowlisted for this workspace are shown. */
  workspaceId?: string;
  newTokenPath: string;
  tokenPath: (tokenId: string) => string;
  description: string;
  emptyMessage: string;
}) {
  const navigate = useNavigate();
  const tokens = useMcpStore((state) => state.tokens);
  const loaded = useMcpStore((state) => state.loaded);
  const fetchAll = useMcpStore((state) => state.fetchAll);
  const revokeMcpToken = useMcpStore((state) => state.revokeToken);
  const tokenAccess = useMcpStore((state) => state.tokenAccess);
  const tokenAccessLoading = useMcpStore((state) => state.tokenAccessLoading);
  const fetchTokenAccess = useMcpStore((state) => state.fetchTokenAccess);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetchAll().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Could not load MCP tokens');
    });
  }, [fetchAll]);

  useEffect(() => {
    for (const item of tokens) {
      void fetchTokenAccess(item.id).catch(() => undefined);
    }
  }, [tokens, fetchTokenAccess]);

  const accessSettled =
    !workspaceId ||
    tokens.every((token) => tokenAccess[token.id] !== undefined || tokenAccessLoading[token.id] === false);
  const visibleTokens = workspaceId
    ? tokens.filter((token) => tokenGrantedTo(tokenAccess[token.id], workspaceId))
    : tokens;

  async function onRevoke(id: string) {
    const confirmed = await confirmDelete({
      title: 'Revoke token?',
      message: 'Revoke this MCP token?',
      confirmLabel: 'Revoke',
    });
    if (!confirmed) return;
    try {
      await revokeMcpToken(id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not revoke token');
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-section-head">
        <div>
          <h2>MCP tokens</h2>
          <p className="muted">{description}</p>
          <p className="muted">
            Using Claude, ChatGPT, or another AI chat app? Add <code>{`${PUBLIC_API_URL}/mcp`}</code> as a custom connector and
            sign in. You don't need a token.
          </p>
        </div>
        <Button type="button" onClick={() => navigate(newTokenPath)}>
          New token
        </Button>
      </div>
      {message ? (
        <p className="error" role="status">
          {message}
        </p>
      ) : null}
      {!loaded ? (
        message ? null : <p className="muted">Loading tokens…</p>
      ) : workspaceId && !accessSettled ? (
        <p className="muted">Loading tokens…</p>
      ) : visibleTokens.length === 0 ? (
        <p className="muted">{emptyMessage}</p>
      ) : (
        <div className="mcp-table-wrap">
          <table className="mcp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Token</th>
                <th>Workspaces</th>
                <th>Created</th>
                <th>Last used</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleTokens.map((token) => (
                <TokenRow
                  key={token.id}
                  token={token}
                  currentWorkspaceId={workspaceId}
                  tokenPath={tokenPath(token.id)}
                  accessRows={tokenAccess[token.id]}
                  accessLoading={Boolean(tokenAccessLoading[token.id])}
                  onRevoke={(id) => void onRevoke(id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
