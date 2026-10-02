import { useMemo, useState, type ReactNode } from 'react';

export type DataTableSelectFilterOption = {
  value: string;
  label: string;
};

export type DataTableColumn<T> = {
  id: string;
  header: string;
  /** Value used for search/filter when `cell` is custom. */
  getValue?: (row: T) => unknown;
  cell?: (row: T) => ReactNode;
  searchable?: boolean;
  filter?: {
    type: 'text' | 'select';
    options?: DataTableSelectFilterOption[];
    /** Defaults to stringified getValue / cell text. */
    getFilterValue?: (row: T) => string;
    placeholder?: string;
  };
  className?: string;
  headerClassName?: string;
};

export type DataTableProps<T> = {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** Hide the search box. Default false. */
  hideSearch?: boolean;
  onRowClick?: (row: T) => void;
  footer?: ReactNode;
  className?: string;
};

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function rowSearchText<T>(row: T, columns: DataTableColumn<T>[]): string {
  return columns
    .filter((col) => col.searchable !== false)
    .map((col) => stringifyValue(col.getValue ? col.getValue(row) : null))
    .join(' ')
    .toLowerCase();
}

function filterValueForColumn<T>(row: T, column: DataTableColumn<T>): string {
  if (column.filter?.getFilterValue) return column.filter.getFilterValue(row);
  if (column.getValue) return stringifyValue(column.getValue(row));
  return '';
}

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  loading = false,
  error = null,
  emptyMessage = 'No rows',
  searchPlaceholder = 'Search…',
  hideSearch = false,
  onRowClick,
  footer,
  className,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});

  const filterableColumns = useMemo(
    () => columns.filter((column) => column.filter),
    [columns]
  );

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !rowSearchText(row, columns).includes(q)) return false;
      for (const column of filterableColumns) {
        const selected = filters[column.id]?.trim() ?? '';
        if (!selected) continue;
        const value = filterValueForColumn(row, column);
        if (column.filter?.type === 'select') {
          if (value !== selected) return false;
        } else if (!value.toLowerCase().includes(selected.toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [rows, columns, filterableColumns, filters, search]);

  return (
    <div className={['data-table', className].filter(Boolean).join(' ')}>
      <div className="data-table-toolbar">
        {!hideSearch ? (
          <input
            type="search"
            className="data-table-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Search table"
          />
        ) : null}
        {filterableColumns.map((column) =>
          column.filter?.type === 'select' ? (
            <select
              key={column.id}
              className="data-table-filter"
              value={filters[column.id] ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, [column.id]: e.target.value }))
              }
              aria-label={`Filter ${column.header}`}
            >
              <option value="">{column.filter.placeholder ?? column.header}</option>
              {(column.filter.options ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              key={column.id}
              type="search"
              className="data-table-filter"
              value={filters[column.id] ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, [column.id]: e.target.value }))
              }
              placeholder={column.filter?.placeholder ?? column.header}
              aria-label={`Filter ${column.header}`}
            />
          )
        )}
      </div>

      {error ? <p className="error data-table-status">{error}</p> : null}
      {loading ? <p className="muted data-table-status">Loading…</p> : null}

      {!loading && !error ? (
        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.id} className={column.headerClassName}>
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const id = getRowId(row);
                return (
                  <tr
                    key={id}
                    className={onRowClick ? 'data-table-row-clickable' : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onRowClick(row);
                            }
                          }
                        : undefined
                    }
                    tabIndex={onRowClick ? 0 : undefined}
                  >
                    {columns.map((column) => (
                      <td key={column.id} className={column.className}>
                        {column.cell
                          ? column.cell(row)
                          : stringifyValue(column.getValue?.(row))}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="muted">
                    {emptyMessage}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {footer ? <div className="data-table-footer">{footer}</div> : null}
    </div>
  );
}

export default DataTable;
