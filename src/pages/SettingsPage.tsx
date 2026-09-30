import { useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { useEditorViewStore, useMcpStore } from '../stores/StoresIndex';
import { MembersPanel } from '../components/ComponentsIndex';
import { canAdmin, type WorkspaceOutlet } from './workspaceContext';
import { THEME_OPTIONS, useTheme } from '../theme/ThemeContext';
import type { McpToken } from '../api/mcp';

type SettingsTab = 'appearance' | 'members' | 'preferences' | 'mcp';

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

function TokenRow({
  token,
  workspaceId,
  onRevoke,
}: {
  token: McpToken;
  workspaceId: string;
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
    navigate(`/w/${workspaceId}/settings/mcp/${token.id}`);
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
        <code className="mcp-table-token">{token.tokenPrefix}…</code>
      </td>
      <td className="muted">{formatDate(token.createdAt)}</td>
      <td className="muted">{token.lastUsedAt ? formatDate(token.lastUsedAt) : 'Never'}</td>
      <td className="mcp-table-actions" onClick={(e) => e.stopPropagation()}>
        <span className={menuOpen ? 'page-row-menu open' : 'page-row-menu'} ref={menuRef}>
          <button
            type="button"
            ref={menuTriggerRef}
            className="linkish icon-btn"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <KebabIcon />
          </button>
          {menuOpen ? (
            <div className="page-row-dropdown" role="menu">
              <button
                type="button"
                role="menuitem"
                className="page-row-dropdown-item danger"
                onClick={() => {
                  setMenuOpen(false);
                  onRevoke(token.id);
                }}
              >
                Revoke
              </button>
            </div>
          ) : null}
        </span>
      </td>
    </tr>
  );
}

const ALL_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'members', label: 'Members' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'mcp', label: 'MCP' },
];

export function SettingsPage() {
  const { workspaceId, role } = useOutletContext<WorkspaceOutlet>();
  const navigate = useNavigate();
  const tokens = useMcpStore((state) => state.tokens);
  const fetchAll = useMcpStore((state) => state.fetchAll);
  const revokeMcpToken = useMcpStore((state) => state.revokeToken);
  const { preference, setPreference } = useTheme();
  const showSource = useEditorViewStore((state) => state.showSource);
  const setShowSource = useEditorViewStore((state) => state.setShowSource);
  const [searchParams, setSearchParams] = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const owner = canAdmin(role);
  const tabs = ALL_TABS.filter((tab) => tab.id !== 'members' || owner);
  const requestedTab = searchParams.get('tab');
  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? (requestedTab as SettingsTab) : tabs[0].id;

  function onSelectTab(id: SettingsTab) {
    const next = new URLSearchParams(searchParams);
    next.set('tab', id);
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    void fetchAll().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Could not load settings');
    });
  }, [fetchAll]);

  async function onRevoke(id: string) {
    if (!window.confirm('Revoke this MCP token?')) return;
    try {
      await revokeMcpToken(id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not revoke token');
    }
  }

  return (
    <section className="settings-page">
      <h1>Settings</h1>
      <p className="muted">Appearance, members, preferences, and MCP access for coding agents.</p>
      {message ? (
        <p className="error" role="status">
          {message}
        </p>
      ) : null}

      <div className="settings-body">
        <nav className="settings-nav" aria-label="Settings sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'settings-nav-item on' : 'settings-nav-item'}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => onSelectTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {activeTab === 'appearance' ? (
            <div className="settings-section">
              <h2>Appearance</h2>
              <p className="muted">Choose how Dirah looks on this device.</p>
              <div className="theme-segmented settings-theme-segmented" role="group" aria-label="Theme">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={preference === option.value ? 'theme-option on' : 'theme-option'}
                    onClick={() => setPreference(option.value)}
                    aria-pressed={preference === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === 'members' && owner ? <MembersPanel workspaceId={workspaceId} /> : null}

          {activeTab === 'preferences' ? (
            <div className="settings-section">
              <h2>Preferences</h2>
              <label className="settings-toggle-row">
                <input
                  type="checkbox"
                  checked={showSource}
                  onChange={(e) => setShowSource(e.target.checked)}
                />
                <span>
                  <strong>Show markdown source by default</strong>
                  <span className="muted"> — reveal the editor pane alongside the preview when you open a document.</span>
                </span>
              </label>
            </div>
          ) : null}

          {activeTab === 'mcp' ? (
            <div className="settings-section">
              <div className="settings-section-head">
                <h2>MCP tokens</h2>
                <button type="button" onClick={() => navigate(`/w/${workspaceId}/settings/mcp/new`)}>
                  New token
                </button>
              </div>
              {tokens.length === 0 ? (
                <p className="muted">No tokens yet. Create one to connect a coding agent.</p>
              ) : (
                <div className="mcp-table-wrap">
                  <table className="mcp-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Token</th>
                        <th>Created</th>
                        <th>Last used</th>
                        <th>
                          <span className="visually-hidden">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tokens.map((token) => (
                        <TokenRow key={token.id} token={token} workspaceId={workspaceId} onRevoke={(id) => void onRevoke(id)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
