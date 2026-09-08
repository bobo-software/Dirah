import { useEffect, useMemo, useState } from 'react';
import { fetchAdminUsers, type AdminUserRow } from '../../api/admin';
import { useAdminAuthStore } from '../../stores/StoresIndex';
import { DataTable, type DataTableColumn } from '../../components/ComponentsIndex';
import { AdminPagination } from './AdminPagination';

const PAGE_SIZE = 25;

export function AdminUsersPage() {
  const accessToken = useAdminAuthStore((state) => state.accessToken);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<AdminUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await fetchAdminUsers(accessToken, page, PAGE_SIZE);
        if (!cancelled) {
          setItems(result.items);
          setTotal(result.total);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load users');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, page]);

  const columns = useMemo<DataTableColumn<AdminUserRow>[]>(
    () => [
      {
        id: 'email',
        header: 'Email',
        getValue: (row) => row.email,
        searchable: true,
        filter: { type: 'text', placeholder: 'Email' },
      },
      {
        id: 'createdAt',
        header: 'Created',
        getValue: (row) => new Date(row.createdAt).toLocaleString(),
        searchable: true,
      },
      {
        id: 'id',
        header: 'Id',
        getValue: (row) => row.id,
        className: 'admin-mono',
        searchable: true,
        filter: { type: 'text', placeholder: 'Id' },
      },
    ],
    []
  );

  return (
    <section className="admin-section">
      <header className="admin-section-head">
        <h1>Users</h1>
        <p className="muted">{total} registered users</p>
      </header>
      <DataTable
        rows={items}
        columns={columns}
        getRowId={(row) => row.id}
        loading={loading}
        error={error}
        emptyMessage="No users yet"
        searchPlaceholder="Search users…"
        footer={<AdminPagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />}
      />
    </section>
  );
}
