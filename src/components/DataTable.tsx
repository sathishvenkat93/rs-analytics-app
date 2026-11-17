import { formatValue } from '../lib/format';

export interface TableColumn {
  key: string;
  label: string;
  numeric?: boolean;
  badge?: string;
}

interface Props {
  columns: TableColumn[];
  rows: object[];
  maxHeight?: number;
  limit?: number;
}

export function DataTable({ columns, rows, maxHeight = 320, limit = 500 }: Props) {
  const shown = rows.slice(0, limit);
  return (
    <div className="table-wrap" style={{ maxHeight }}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.numeric ? 'num' : undefined} scope="col">
                {c.label}
                {c.badge && <span className={`type-badge type-${c.badge}`}>{c.badge}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => {
                const v = (r as Record<string, unknown>)[c.key];
                return (
                  <td key={c.key} className={c.numeric ? 'num' : undefined}>
                    {v === null || v === undefined ? <span className="muted">—</span> : typeof v === 'number' ? formatValue(v) : String(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > limit && (
        <p className="chart-note table-note">
          Showing first {limit.toLocaleString()} of {rows.length.toLocaleString()} rows
        </p>
      )}
    </div>
  );
}
