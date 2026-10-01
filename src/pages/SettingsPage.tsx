import { useOutletContext, useSearchParams } from 'react-router-dom';
import { useEditorViewStore } from '../stores/StoresIndex';
import { MembersPanel } from '../components/ComponentsIndex';
import { McpTokensSection } from '../components/McpTokensSection';
import { canAdmin, type WorkspaceOutlet } from './workspaceContext';
import { THEME_OPTIONS, useTheme } from '../theme/ThemeContext';

type SettingsTab = 'appearance' | 'members' | 'preferences' | 'mcp';

const ALL_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'members', label: 'Members' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'mcp', label: 'MCP' },
];

export function SettingsPage() {
  const { workspaceId, role } = useOutletContext<WorkspaceOutlet>();
  const { preference, setPreference } = useTheme();
  const showSource = useEditorViewStore((state) => state.showSource);
  const setShowSource = useEditorViewStore((state) => state.setShowSource);
  const [searchParams, setSearchParams] = useSearchParams();
  const owner = canAdmin(role);
  const tabs = ALL_TABS.filter((tab) => tab.id !== 'members' || owner);
  const requestedTab = searchParams.get('tab');
  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? (requestedTab as SettingsTab) : tabs[0].id;

  function onSelectTab(id: SettingsTab) {
    const next = new URLSearchParams(searchParams);
    next.set('tab', id);
    setSearchParams(next, { replace: true });
  }

  return (
    <section className="settings-page">
      <h1>Settings</h1>
      <p className="muted">Appearance, members, preferences, and MCP access for this workspace.</p>

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
            <McpTokensSection
              workspaceId={workspaceId}
              newTokenPath={`/w/${workspaceId}/settings/mcp/new`}
              tokenPath={(tokenId) => `/w/${workspaceId}/settings/mcp/${tokenId}`}
              description="Tokens granted to this workspace. Every token on your account is in Settings from the profile menu."
              emptyMessage="No tokens granted to this workspace."
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
