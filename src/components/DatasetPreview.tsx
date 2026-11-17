import type { Dataset } from '../types';
import { DataTable } from './DataTable';
import { Modal } from './Modal';

export function DatasetPreview({ dataset, onClose }: { dataset: Dataset; onClose: () => void }) {
  const counts = dataset.columns.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.type]: (acc[c.type] ?? 0) + 1 }), {});
  return (
    <Modal title={dataset.name} onClose={onClose} wide>
      <p className="muted small preview-meta">
        {dataset.fileName} · {dataset.rows.length.toLocaleString()} rows · {dataset.columns.length} columns
        {Object.entries(counts).map(([t, n]) => ` · ${n} ${t}`)}
      </p>
      <DataTable
        columns={dataset.columns.map((c) => ({ key: c.name, label: c.name, numeric: c.type === 'number', badge: c.type }))}
        rows={dataset.rows}
        limit={200}
        maxHeight={520}
      />
    </Modal>
  );
}
