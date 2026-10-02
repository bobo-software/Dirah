import { useEffect, useMemo, useState } from 'react';
import { fetchAdminMcpAudit, type AdminMcpAuditRow } from '../../api/admin';
import { AdminPagination } from './AdminPagination';
import { DataTable, type DataTableColumn } from './DataTable';
import { McpAuditDetailModal } from './McpAuditDetailModal';

const PAGE_SIZE = 25;

export function McpRequestsPanel({ accessToken }: { accessToken: string }) {
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
    [outcomeOptions, toolOptions],
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
