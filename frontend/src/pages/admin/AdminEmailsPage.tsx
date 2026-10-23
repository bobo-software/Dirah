import { useEffect, useMemo, useState } from 'react';
import { fetchAdminEmails, type AdminEmailRow } from '../../api/admin';
import { useAdminAuthStore } from '../../stores/StoresIndex';
import { AdminPagination, DataTable, type DataTableColumn } from '../../components/ComponentsIndex';

const PAGE_SIZE = 25;

export function AdminEmailsPage() {
  const accessToken = useAdminAuthStore((state) => state.accessToken);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<AdminEmailRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await fetchAdminEmails(accessToken, page, PAGE_SIZE);
        if (!cancelled) {
          setItems(result.items);
          setTotal(result.total);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load emails');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, page]);

  const columns = useMemo<DataTableColumn<AdminEmailRow>[]>(
    () => [
      {
        id: 'to',
        header: 'To',
        getValue: (row) => row.to,
        searchable: true,
        filter: { type: 'text', placeholder: 'To' },
      },
      {
        id: 'subject',
        header: 'Subject',
        getValue: (row) => row.subject,
        searchable: true,
      },
      {
        id: 'kind',
        header: 'Kind',
        getValue: (row) => row.kind,
        searchable: true,
        filter: {
          type: 'select',
          placeholder: 'Kind',
          options: [{ value: 'workspace_invite', label: 'workspace_invite' }],
          getFilterValue: (row) => row.kind,
        },
      },
      {
        id: 'status',
        header: 'Status',
        getValue: (row) => (row.success ? 'Sent' : 'Failed'),
        cell: (row) =>
          row.success ? (
            <span className="admin-badge ok">Sent</span>
          ) : (
            <span className="admin-badge fail" title={row.error ?? undefined}>
              Failed
            </span>
          ),
        filter: {
          type: 'select',
          placeholder: 'Status',
          options: [
            { value: 'Sent', label: 'Sent' },
            { value: 'Failed', label: 'Failed' },
          ],
          getFilterValue: (row) => (row.success ? 'Sent' : 'Failed'),
        },
        searchable: true,
      },
      {
        id: 'createdAt',
        header: 'When',
        getValue: (row) => new Date(row.createdAt).toLocaleString(),
        searchable: true,
      },
    ],
    []
  );

  return (
    <section className="admin-section">
      <header className="admin-section-head">
        <h1>Sent emails</h1>
        <p className="muted">{total} email attempts logged</p>
      </header>
      <DataTable
        rows={items}
        columns={columns}
        getRowId={(row) => row.id}
        loading={loading}
        error={error}
        emptyMessage="No emails logged yet"
        searchPlaceholder="Search emails…"
        footer={<AdminPagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />}
      />
    </section>
  );
}
