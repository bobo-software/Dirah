import { useEffect, useState } from 'react';
import { fetchAdminRequestAnalytics, type RequestAnalytics } from '../../api/admin';
import { AdminBarChart, AdminLineChart } from './AdminBarChart';

function hourLabel(bucket: string): string {
  const date = new Date(bucket);
  if (Number.isNaN(date.getTime())) return bucket;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function AnalyticsPanel({ accessToken }: { accessToken: string }) {
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

  const apiErrorRate = analytics.api.total === 0 ? 0 : (analytics.api.errors / analytics.api.total) * 100;

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
