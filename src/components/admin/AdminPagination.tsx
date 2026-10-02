type Props = {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
};

export function AdminPagination({ page, pageSize, total, onChange }: Props) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  return (
    <div className="admin-pagination">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <span className="muted">
        Page {page} of {pageCount}
      </span>
      <button type="button" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </div>
  );
}
