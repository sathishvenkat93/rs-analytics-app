import type { ChartConfig, Dataset, ExtraRole } from '../types';
import { buildTable, NA_TOKENS, type RawCell } from './infer';

/**
 * Column housekeeping: find columns that add nothing to charts, clean NA
 * markers, and apply renames/discards to a dataset and every chart using it.
 */

/** Extra markers treated as missing when the user asks to clean a dataset. */
const CLEANUP_TOKENS = new Set([...NA_TOKENS, '-', '--', '—', '?', 'N.A.', 'n.a.', '(blank)', '(null)', 'missing', 'Missing']);
const isNaText = (v: unknown) => typeof v === 'string' && CLEANUP_TOKENS.has(v.trim());

export type DiscardKind = 'empty' | 'na' | 'constant' | 'duplicate' | 'id';

export interface DiscardCandidate {
  column: string;
  kind: DiscardKind;
  reason: string;
}

export interface ColumnAnalysis {
  candidates: DiscardCandidate[];
  /** Columns holding NA-like text, with how many cells. */
  naCells: { column: string; count: number }[];
}

export function analyzeColumns(ds: Dataset): ColumnAnalysis {
  const n = ds.rows.length;
  const candidates: DiscardCandidate[] = [];
  const naCells: ColumnAnalysis['naCells'] = [];
  const fingerprints = new Map<string, string>();

  for (const col of ds.columns) {
    let filled = 0;
    let na = 0;
    const distinct = new Set<unknown>();
    for (const r of ds.rows) {
      const v = r[col.name];
      if (v === null || v === undefined || v === '') continue;
      if (isNaText(v)) {
        na++;
        continue;
      }
      filled++;
      if (distinct.size < 2000) distinct.add(v);
    }
    if (na) naCells.push({ column: col.name, count: na });

    if (filled === 0) candidates.push({ column: col.name, kind: na ? 'na' : 'empty', reason: na ? `Only placeholder values like “N/A” (${na.toLocaleString()} cells).` : 'Every cell is empty.' });
    else if (filled / n < 0.05) candidates.push({ column: col.name, kind: 'empty', reason: `${Math.round((1 - filled / n) * 100)}% of cells are empty.` });
    else if (distinct.size === 1 && n > 1) candidates.push({ column: col.name, kind: 'constant', reason: `Same value in every row (“${String([...distinct][0]).slice(0, 30)}”).` });
    else if (col.type === 'string' && n > 10 && distinct.size >= filled * 0.98 && /(^|[\s_.-])(id|uuid|guid|hash|key)$/i.test(col.name)) {
      candidates.push({ column: col.name, kind: 'id', reason: 'A unique identifier per row; not useful to group or measure.' });
    }

    // Exact duplicates of an earlier column.
    if (filled > 0) {
      const fp = ds.rows.map((r) => String(r[col.name] ?? '')).join('\u0001');
      const twin = fingerprints.get(fp);
      if (twin && !candidates.some((c) => c.column === col.name)) candidates.push({ column: col.name, kind: 'duplicate', reason: `Identical to “${twin}”.` });
      else if (!twin) fingerprints.set(fp, col.name);
    }
  }
  return { candidates, naCells };
}

/** Columns a chart reads, for blocking discards and remapping renames. */
export function columnsUsedBy(cfg: ChartConfig): string[] {
  return [cfg.xField, ...cfg.yFields, cfg.groupField, cfg.sizeField, ...Object.values(cfg.extra)].filter((c): c is string => !!c);
}

export function remapChart(cfg: ChartConfig, rename: Map<string, string>): ChartConfig {
  const r = (c: string | null) => (c && rename.has(c) ? rename.get(c)! : c);
  const extra: ChartConfig['extra'] = {};
  for (const [k, v] of Object.entries(cfg.extra) as [ExtraRole, string][]) extra[k] = r(v) ?? undefined;
  return { ...cfg, xField: r(cfg.xField), yFields: cfg.yFields.map((y) => r(y)!), groupField: r(cfg.groupField), sizeField: r(cfg.sizeField), extra };
}

export interface ColumnChanges {
  rename: Map<string, string>;
  discard: string[];
  cleanNa: boolean;
}

/** Returns a new dataset (same id) with the changes applied and column types re-detected where values changed. */
export function applyColumnChanges(ds: Dataset, ch: ColumnChanges): Dataset {
  const drop = new Set(ch.discard);
  const kept = ds.columns.filter((c) => !drop.has(c.name));
  const names = kept.map((c) => ch.rename.get(c.name) ?? c.name);
  if (!ch.cleanNa) {
    const rows = ds.rows.map((r) => {
      const o: Dataset['rows'][number] = {};
      kept.forEach((c, i) => (o[names[i]] = r[c.name] ?? null));
      return o;
    });
    return { ...ds, columns: kept.map((c, i) => ({ ...c, name: names[i] })), rows };
  }
  // Cleaning NA text can turn a "text" column numeric, so rebuild types from the cleaned values.
  const body: RawCell[][] = ds.rows.map((r) => kept.map((c) => (isNaText(r[c.name]) ? null : (r[c.name] as RawCell))));
  const rebuilt = buildTable(names, body);
  return { ...ds, columns: rebuilt.columns, rows: rebuilt.rows };
}
