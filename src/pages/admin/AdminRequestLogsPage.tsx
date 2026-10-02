import { useState } from 'react';
import { useAdminAuthStore } from '../../stores/StoresIndex';
import { AnalyticsPanel, ApiRequestsPanel, McpRequestsPanel } from '../../components/ComponentsIndex';

type Tab = 'analytics' | 'api' | 'mcp';

export function AdminRequestLogsPage() {
  const accessToken = useAdminAuthStore((state) => state.accessToken);
  const [tab, setTab] = useState<Tab>('analytics');

  if (!accessToken) return <p className="muted">Loading…</p>;

  return (
    <section className="admin-section">
      <header className="admin-section-head">
        <h1>API logs</h1>
        <p className="muted">Request volume, HTTP traffic, and MCP tool usage.</p>
      </header>

      <div className="admin-tabs" role="tablist" aria-label="API logs">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'analytics'}
          className={tab === 'analytics' ? 'admin-tab on' : 'admin-tab'}
          onClick={() => setTab('analytics')}
        >
          Analytics
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'api'}
          className={tab === 'api' ? 'admin-tab on' : 'admin-tab'}
          onClick={() => setTab('api')}
        >
          API Requests
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mcp'}
          className={tab === 'mcp' ? 'admin-tab on' : 'admin-tab'}
          onClick={() => setTab('mcp')}
        >
          MCP Requests
        </button>
      </div>

      <div className="admin-tab-panel" role="tabpanel">
        {tab === 'analytics' ? <AnalyticsPanel accessToken={accessToken} /> : null}
        {tab === 'api' ? <ApiRequestsPanel accessToken={accessToken} /> : null}
        {tab === 'mcp' ? <McpRequestsPanel accessToken={accessToken} /> : null}
      </div>
    </section>
  );
}
