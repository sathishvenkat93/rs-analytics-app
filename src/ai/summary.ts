import type { ChartTypeInfo, ColumnSummary, DatasetSummary } from '../../shared/ai';
import { CHART_TYPE_IDS } from '../../shared/ai';
import type { ChartType, Dataset } from '../types';
import { profileDataset } from '../charts/profile';
import { CHART_TYPES } from '../charts/registry';

/**
 * What the AI sees of a dataset: column names, types, simple stats, a few
 * example values and sample rows. Never the full data.
 */

// The server's chart-type list must match the app's registry exactly.
const _sameTypes: readonly ChartType[] = CHART_TYPE_IDS;
const _sameTypesBack: readonly (typeof CHART_TYPE_IDS)[number][] = CHART_TYPES.map((d) => d.type);
void _sameTypes;
void _sameTypesBack;

const MAX_COLUMNS = 150;
const SAMPLE_ROWS = 6;
const clip = (v: unknown, n = 40): string | number | null => (v === null || v === undefined ? null : typeof v === 'number' ? v : String(v).length > n ? `${String(v).slice(0, n - 1)}…` : String(v));
const round = (n: number) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100);

export function summarizeDataset(ds: Dataset): DatasetSummary {
  const p = profileDataset(ds);
  const n = ds.rows.length || 1;
  const columns: ColumnSummary[] = p.columns.slice(0, MAX_COLUMNS).map((c) => {
    const examples: (string | number)[] = [];
    const seen = new Set<unknown>();
    for (const r of ds.rows) {
      const v = r[c.name];
      if (v === null || v === undefined || seen.has(v)) continue;
      seen.add(v);
      examples.push(clip(v) as string | number);
      if (examples.length >= 5) break;
    }
    const out: ColumnSummary = { name: c.name, type: c.type, distinct: c.distinct, missing: Math.round((1 - c.nonNull / n) * 100) / 100, examples };
    if (c.type === 'number' && c.nonNull) {
      out.min = round(c.min);
      out.max = round(c.max);
      let sum = 0;
      let count = 0;
      for (const r of ds.rows) if (typeof r[c.name] === 'number') (sum += r[c.name] as number), count++;
      out.mean = round(sum / count);
    }
    if (c.type === 'date') {
      let min = '';
      let max = '';
      for (const r of ds.rows) {
        const v = r[c.name];
        if (typeof v !== 'string') continue;
        if (!min || v < min) min = v;
        if (!max || v > max) max = v;
      }
      out.min = min;
      out.max = max;
    }
    return out;
  });
  const step = Math.max(1, Math.floor(ds.rows.length / SAMPLE_ROWS));
  const names = columns.map((c) => c.name);
  const sample = Array.from({ length: Math.min(SAMPLE_ROWS, ds.rows.length) }, (_, i) => {
    const r = ds.rows[i * step];
    return Object.fromEntries(names.map((k) => [k, clip(r[k], 30)]));
  });
  return { id: ds.id, name: ds.name, fileName: ds.fileName, rows: ds.rows.length, columns, sample };
}

/** The chart catalog, straight from the registry, in the compact form the model needs. */
export function chartCatalog(): ChartTypeInfo[] {
  return CHART_TYPES.map((d) => ({
    type: d.type,
    name: d.name,
    use: `${d.short}. ${d.when[0]}. Needs: ${d.needs}`,
    fields: d.fields.map((f) => ({
      role: f.role === 'x' || f.role === 'y' || f.role === 'group' || f.role === 'size' ? f.role : `extra.${f.role}`,
      label: f.label,
      accepts: f.accepts,
      required: f.required,
      ...(f.multi ? { multi: true } : {}),
    })),
    aggregate: !!d.aggregate,
  }));
}
