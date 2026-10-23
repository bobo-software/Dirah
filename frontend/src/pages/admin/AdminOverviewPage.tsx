import { useEffect, useState } from 'react';
import { fetchAdminMetrics, type AdminMetrics } from '../../api/admin';
import { useAdminAuthStore } from '../../stores/StoresIndex';

export function AdminOverviewPage() {
  const accessToken = useAdminAuthStore((state) => state.accessToken);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const { metrics: next } = await fetchAdminMetrics(accessToken);
        if (!cancelled) setMetrics(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load metrics');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (error) return <p className="error">{error}</p>;
  if (!metrics) return <p className="muted">Loading metrics…</p>;

  const cards: { label: string; value: string }[] = [
    { label: 'Users', value: String(metrics.users) },
    { label: 'Workspaces', value: String(metrics.workspaces) },
    { label: 'Pages', value: String(metrics.pages) },
    { label: 'API requests (24h)', value: String(metrics.requestLogs24h) },
    { label: 'Emails (24h)', value: String(metrics.emails24h) },
    { label: 'Error rate (24h)', value: `${(metrics.errorRate24h * 100).toFixed(1)}%` },
  ];

  return (
    <section className="admin-section">
      <header className="admin-section-head">
        <h1>Overview</h1>
        <p className="muted">System metrics for the last 24 hours where noted.</p>
      </header>
      <div className="admin-metric-grid">
        {cards.map((card) => (
          <article key={card.label} className="admin-metric-card">
            <p className="muted">{card.label}</p>
            <p className="admin-metric-value">{card.value}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
