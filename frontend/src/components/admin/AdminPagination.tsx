import { Button } from '../buttons/Button';
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
      <Button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <span className="muted">
        Page {page} of {pageCount}
      </span>
      <Button type="button" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </div>
  );
}
