import { useOutletContext, useSearchParams } from 'react-router-dom';
import { AppearanceSection, McpTokensSection, MembersPanel, PreferencesSection } from '../components/ComponentsIndex';
import { canAdmin, canManageMembers, type WorkspaceOutlet } from './workspaceContext';

type SettingsTab = 'appearance' | 'members' | 'preferences' | 'mcp';

const ALL_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'members', label: 'Members' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'mcp', label: 'MCP' },
];

export function SettingsPage() {
  const { workspaceId, role } = useOutletContext<WorkspaceOutlet>();
  const [searchParams, setSearchParams] = useSearchParams();
  const owner = canAdmin(role);
  const manager = canManageMembers(role);
  const tabs = ALL_TABS.filter((tab) => tab.id !== 'members' || manager);
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
          {activeTab === 'appearance' ? <AppearanceSection /> : null}

          {activeTab === 'members' && manager ? <MembersPanel workspaceId={workspaceId} owner={owner} /> : null}

          {activeTab === 'preferences' ? <PreferencesSection /> : null}

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
