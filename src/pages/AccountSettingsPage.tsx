import { useSearchParams } from 'react-router-dom';
import { McpTokensSection, ProfileSection, SecuritySection } from '../components/ComponentsIndex';
import { Button } from '../components/buttons/Button';

type AccountTab = 'profile' | 'security' | 'mcp';

const TABS: { id: AccountTab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'mcp', label: 'MCP' },
];

export function AccountSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const activeTab = TABS.some((tab) => tab.id === requested) ? (requested as AccountTab) : 'profile';

  function onSelectTab(id: AccountTab) {
    const next = new URLSearchParams(searchParams);
    next.set('tab', id);
    setSearchParams(next, { replace: true });
  }

  return (
    <section className="settings-page">
      <h1>Settings</h1>
      <p className="muted">Your profile, security, and MCP tokens.</p>
      <div className="settings-body">
        <nav className="settings-nav" aria-label="Settings sections">
          {TABS.map((tab) => (
            <Button variant="plain"
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'settings-nav-item on' : 'settings-nav-item'}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => onSelectTab(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </nav>
        <div className="settings-content">
          {activeTab === 'profile' ? <ProfileSection /> : null}
          {activeTab === 'security' ? <SecuritySection /> : null}
          {activeTab === 'mcp' ? (
            <McpTokensSection
              newTokenPath="/settings/mcp/new"
              tokenPath={(tokenId) => `/settings/mcp/${tokenId}`}
              description="Every token you have created, including ones granted to other workspaces."
              emptyMessage="No tokens yet. Create one to connect a coding agent."
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
