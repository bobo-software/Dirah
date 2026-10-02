import { useEffect, useMemo, useState } from 'react';
import { fetchAdminRequestLogs, type AdminRequestLogRow } from '../../api/admin';
import { AdminPagination } from './AdminPagination';
import { DataTable, type DataTableColumn } from './DataTable';
import { RequestLogDetailModal } from './RequestLogDetailModal';

const PAGE_SIZE = 25;

export function ApiRequestsPanel({ accessToken }: { accessToken: string }) {
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
        cell: (row) => <span className={row.success ? 'admin-badge ok' : 'admin-badge fail'}>{row.statusCode}</span>,
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
    [],
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
