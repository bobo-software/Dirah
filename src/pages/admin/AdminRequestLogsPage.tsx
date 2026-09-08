import { useEffect, useMemo, useState } from 'react';
import {
  fetchAdminMcpAudit,
  fetchAdminRequestAnalytics,
  fetchAdminRequestLogs,
  type AdminMcpAuditRow,
  type AdminRequestLogRow,
  type RequestAnalytics,
} from '../../api/admin';
import { useAdminAuthStore } from '../../stores/StoresIndex';
import { DataTable, RequestLogDetailModal, type DataTableColumn } from '../../components/ComponentsIndex';
import { AdminPagination } from './AdminPagination';
import { AdminBarChart, AdminLineChart } from './AdminBarChart';
import { McpAuditDetailModal } from './McpAuditDetailModal';

const PAGE_SIZE = 25;

type Tab = 'analytics' | 'api' | 'mcp';

function hourLabel(bucket: string): string {
  const date = new Date(bucket);
  if (Number.isNaN(date.getTime())) return bucket;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function AnalyticsPanel({ accessToken }: { accessToken: string }) {
  const [analytics, setAnalytics] = useState<RequestAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const { analytics: next } = await fetchAdminRequestAnalytics(accessToken, 24);
        if (!cancelled) {
          setAnalytics(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (loading) return <p className="muted">Loading analytics…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!analytics) return null;

  const apiErrorRate =
    analytics.api.total === 0 ? 0 : (analytics.api.errors / analytics.api.total) * 100;

  return (
    <div className="admin-analytics">
      <div className="admin-metric-grid">
        <article className="admin-metric-card">
          <p className="muted">API requests (24h)</p>
          <p className="admin-metric-value">{analytics.api.total}</p>
        </article>
        <article className="admin-metric-card">
          <p className="muted">API errors (24h)</p>
          <p className="admin-metric-value">{analytics.api.errors}</p>
        </article>
        <article className="admin-metric-card">
          <p className="muted">API error rate</p>
          <p className="admin-metric-value">{apiErrorRate.toFixed(1)}%</p>
        </article>
        <article className="admin-metric-card">
          <p className="muted">Avg duration</p>
          <p className="admin-metric-value">{analytics.api.avgDurationMs}ms</p>
        </article>
        <article className="admin-metric-card">
          <p className="muted">MCP calls (24h)</p>
          <p className="admin-metric-value">{analytics.mcp.total}</p>
        </article>
      </div>

      <div className="admin-chart-grid">
        <AdminLineChart
          title="API requests by hour"
          data={analytics.api.byHour.map((row) => ({
            label: hourLabel(row.bucket),
            value: row.total,
            secondary: row.errors,
          }))}
        />
        <AdminLineChart
          title="MCP calls by hour"
          data={analytics.mcp.byHour.map((row) => ({
            label: hourLabel(row.bucket),
            value: row.total,
            secondary: row.errors,
          }))}
        />
        <AdminBarChart
          title="API by method"
          data={analytics.api.byMethod.map((row) => ({
            label: row.name,
            value: row.count,
          }))}
        />
        <AdminBarChart
          title="API by status"
          data={analytics.api.byStatus.map((row) => ({
            label: row.name,
            value: row.count,
          }))}
        />
        <AdminBarChart
          title="MCP by tool"
          data={analytics.mcp.byTool.map((row) => ({
            label: row.name,
            value: row.count,
          }))}
        />
        <AdminBarChart
          title="MCP by outcome"
          data={analytics.mcp.byOutcome.map((row) => ({
            label: row.name,
            value: row.count,
          }))}
        />
      </div>
    </div>
  );
}

function ApiRequestsPanel({ accessToken }: { accessToken: string }) {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<AdminRequestLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminRequestLogRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await fetchAdminRequestLogs(accessToken, page, PAGE_SIZE);
        if (!cancelled) {
          setItems(result.items);
          setTotal(result.total);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load logs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, page]);

  const columns = useMemo<DataTableColumn<AdminRequestLogRow>[]>(
    () => [
      {
        id: 'createdAt',
        header: 'When',
        getValue: (row) => new Date(row.createdAt).toLocaleString(),
        searchable: true,
      },
      {
        id: 'method',
        header: 'Method',
        getValue: (row) => row.method,
        searchable: true,
        filter: {
          type: 'select',
          placeholder: 'Method',
          options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => ({
            value: method,
            label: method,
          })),
        },
      },
      {
        id: 'url',
        header: 'URL',
        getValue: (row) => row.url,
        className: 'admin-mono admin-url',
        searchable: true,
        filter: { type: 'text', placeholder: 'URL' },
      },
      {
        id: 'status',
        header: 'Status',
        getValue: (row) => String(row.statusCode),
        cell: (row) => (
          <span className={row.success ? 'admin-badge ok' : 'admin-badge fail'}>{row.statusCode}</span>
        ),
        filter: {
          type: 'select',
          placeholder: 'Outcome',
          options: [
            { value: 'ok', label: 'Success' },
            { value: 'fail', label: 'Error' },
          ],
          getFilterValue: (row) => (row.success ? 'ok' : 'fail'),
        },
        searchable: true,
      },
      {
        id: 'durationMs',
        header: 'ms',
        getValue: (row) => row.durationMs,
        searchable: false,
      },
      {
        id: 'message',
        header: 'Message',
        getValue: (row) => row.message,
        searchable: true,
      },
    ],
    []
  );

  return (
    <>
      <p className="muted admin-tab-meta">{total} API requests</p>
      <DataTable
        rows={items}
        columns={columns}
        getRowId={(row) => row.id}
        loading={loading}
        error={error}
        emptyMessage="No request logs yet"
        searchPlaceholder="Search requests…"
        onRowClick={setSelected}
        footer={<AdminPagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />}
      />
      {selected ? <RequestLogDetailModal log={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

function McpRequestsPanel({ accessToken }: { accessToken: string }) {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<AdminMcpAuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminMcpAuditRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await fetchAdminMcpAudit(accessToken, page, PAGE_SIZE);
        if (!cancelled) {
          setItems(result.items);
          setTotal(result.total);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load MCP audit');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, page]);

  const outcomeOptions = useMemo(() => {
    const set = new Set(items.map((row) => row.outcome));
    return [...set].sort().map((outcome) => ({ value: outcome, label: outcome }));
  }, [items]);

  const toolOptions = useMemo(() => {
    const set = new Set(items.map((row) => row.tool));
    return [...set].sort().map((tool) => ({ value: tool, label: tool }));
  }, [items]);

  const columns = useMemo<DataTableColumn<AdminMcpAuditRow>[]>(
    () => [
      {
        id: 'createdAt',
        header: 'When',
        getValue: (row) => new Date(row.createdAt).toLocaleString(),
        searchable: true,
      },
      {
        id: 'tool',
        header: 'Tool',
        getValue: (row) => row.tool,
        searchable: true,
        filter: {
          type: 'select',
          placeholder: 'Tool',
          options: toolOptions,
        },
      },
      {
        id: 'outcome',
        header: 'Outcome',
        getValue: (row) => row.outcome,
        cell: (row) => {
          const ok = row.outcome === 'ok' || row.outcome === 'success';
          return <span className={ok ? 'admin-badge ok' : 'admin-badge fail'}>{row.outcome}</span>;
        },
        searchable: true,
        filter: {
          type: 'select',
          placeholder: 'Outcome',
          options: outcomeOptions,
        },
      },
      {
        id: 'userId',
        header: 'User',
        getValue: (row) => row.userId ?? '',
        className: 'admin-mono',
        searchable: true,
      },
      {
        id: 'workspaceId',
        header: 'Workspace',
        getValue: (row) => row.workspaceId ?? '',
        className: 'admin-mono',
        searchable: true,
      },
    ],
    [outcomeOptions, toolOptions]
  );

  return (
    <>
      <p className="muted admin-tab-meta">{total} MCP audit events</p>
      <DataTable
        rows={items}
        columns={columns}
        getRowId={(row) => row.id}
        loading={loading}
        error={error}
        emptyMessage="No MCP audit events yet"
        searchPlaceholder="Search MCP calls…"
        onRowClick={setSelected}
        footer={<AdminPagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />}
      />
      {selected ? <McpAuditDetailModal row={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

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
