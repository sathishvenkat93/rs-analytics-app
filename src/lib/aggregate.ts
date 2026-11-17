import type { Aggregation, ChartConfig, ColumnType, Dataset, DateBucket, Row } from '../types';

export const CATEGORY_KEY = '__category';
export const BLANK_LABEL = '(blank)';
export const MAX_SERIES = 8;
export const MAX_SLICES = 8;
export const OTHER_LABEL = 'Other';

export interface SeriesDef {
  key: string;
  label: string;
  /** Categorical slot, fixed by the series' position in the config — never by rank. */
  colorIndex: number;
}

export type Datum = Record<string, string | number>;

export interface CategoryResult {
  data: Datum[];
  series: SeriesDef[];
  totalCategories: number;
}

export interface PieSlice {
  name: string;
  value: number;
  /** -1 = the folded "Other" slice. */
  colorIndex: number;
}

export interface PieResult {
  slices: PieSlice[];
  total: number;
  totalCategories: number;
  valueLabel: string;
}

export const AGG_LABEL: Record<Aggregation, string> = {
  sum: 'Sum',
  avg: 'Average',
  count: 'Count',
  min: 'Min',
  max: 'Max',
};

export function columnType(ds: Dataset, field: string | null): ColumnType | null {
  if (!field) return null;
  return ds.columns.find((c) => c.name === field)?.type ?? null;
}

export function bucketLabel(value: Row[string], type: ColumnType | null, bucket: DateBucket): string {
  if (value === null || value === undefined || value === '') return BLANK_LABEL;
  if (type !== 'date' || bucket === 'none' || bucket === 'day') return String(value);
  const s = String(value);
  const year = s.slice(0, 4);
  const month = Number(s.slice(5, 7));
  if (bucket === 'year') return year;
  if (bucket === 'quarter') return `${year} Q${Math.ceil(month / 3)}`;
  return s.slice(0, 7);
}

function compareCategories(type: ColumnType | null) {
  return (a: string, b: string) => {
    if (a === BLANK_LABEL) return 1;
    if (b === BLANK_LABEL) return -1;
    if (type === 'number') return Number(a) - Number(b);
    return a < b ? -1 : a > b ? 1 : 0;
  };
}

/** Distinct category labels for a column, in the order the chart will show them. */
export function distinctCategories(ds: Dataset, field: string, bucket: DateBucket): string[] {
  const type = columnType(ds, field);
  const seen = new Set<string>();
  for (const row of ds.rows) seen.add(bucketLabel(row[field], type, bucket));
  const list = [...seen];
  if (type === 'date' || type === 'number') list.sort(compareCategories(type));
  return list;
}

interface Acc {
  sum: number;
  count: number;
  min: number;
  max: number;
  rows: number;
}

function newAcc(): Acc {
  return { sum: 0, count: 0, min: Infinity, max: -Infinity, rows: 0 };
}

function finish(acc: Acc, agg: Aggregation, countRowsOnly: boolean): number {
  if (agg === 'count') return countRowsOnly ? acc.rows : acc.count;
  if (acc.count === 0) return 0;
  switch (agg) {
    case 'sum':
      return acc.sum;
    case 'avg':
      return acc.sum / acc.count;
    case 'min':
      return acc.min;
    case 'max':
      return acc.max;
  }
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export function seriesLabel(field: string | null, agg: Aggregation): string {
  if (!field) return 'Row count';
  return agg === 'sum' ? field : `${AGG_LABEL[agg]} of ${field}`;
}

function groupRows(ds: Dataset, cfg: ChartConfig, fields: (string | null)[]) {
  const xType = columnType(ds, cfg.xField);
  const include = cfg.includeCategories ? new Set(cfg.includeCategories) : null;
  const groups = new Map<string, Acc[]>();
  for (const row of ds.rows) {
    const key = cfg.xField ? bucketLabel(row[cfg.xField], xType, cfg.dateBucket) : 'All';
    if (include && !include.has(key)) continue;
    let accs = groups.get(key);
    if (!accs) {
      accs = fields.map(newAcc);
      groups.set(key, accs);
    }
    fields.forEach((f, i) => {
      const acc = accs![i];
      acc.rows++;
      if (!f) return;
      const v = row[f];
      if (typeof v !== 'number') return;
      acc.sum += v;
      acc.count++;
      if (v < acc.min) acc.min = v;
      if (v > acc.max) acc.max = v;
    });
  }
  return { groups, xType };
}

/** Bar / line / area: one row per category, one key per series. */
export function aggregateCategories(ds: Dataset, cfg: ChartConfig): CategoryResult {
  const fields: (string | null)[] = cfg.yFields.length ? cfg.yFields.slice(0, MAX_SERIES) : [null];
  const agg: Aggregation = fields[0] === null ? 'count' : cfg.aggregation;
  const series: SeriesDef[] = fields.map((f, i) => ({ key: `s${i}`, label: seriesLabel(f, agg), colorIndex: i }));
  const { groups, xType } = groupRows(ds, cfg, fields);

  let keys = [...groups.keys()];
  if (xType === 'date' || xType === 'number') keys.sort(compareCategories(xType));

  const totals = new Map<string, number>();
  const data: Datum[] = keys.map((k) => {
    const d: Datum = { [CATEGORY_KEY]: k };
    let total = 0;
    groups.get(k)!.forEach((acc, i) => {
      const v = round(finish(acc, agg, fields[i] === null));
      d[`s${i}`] = v;
      total += v;
    });
    totals.set(k, total);
    return d;
  });

  const totalCategories = data.length;
  let out = data;
  const { topN, sort } = cfg.options;
  if (topN > 0 && topN < out.length) {
    const keep = new Set([...keys].sort((a, b) => totals.get(b)! - totals.get(a)!).slice(0, topN));
    out = out.filter((d) => keep.has(String(d[CATEGORY_KEY])));
  }
  if (sort !== 'none') {
    const dir = sort === 'asc' ? 1 : -1;
    out = [...out].sort((a, b) => dir * (totals.get(String(a[CATEGORY_KEY]))! - totals.get(String(b[CATEGORY_KEY]))!));
  }
  return { data: out, series, totalCategories };
}

/**
 * Pie: slices coloured by their rank in the full composition, so moving the
 * slice-count slider never repaints the slices that stay.
 */
export function aggregatePie(ds: Dataset, cfg: ChartConfig): PieResult {
  const field = cfg.yFields[0] ?? null;
  const agg: Aggregation = field === null ? 'count' : cfg.aggregation;
  const { groups } = groupRows(ds, cfg, [field]);
  const ranked = [...groups.entries()]
    .map(([name, accs]) => ({ name, value: round(finish(accs[0], agg, field === null)) }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
  const limit = Math.min(cfg.options.topN > 0 ? cfg.options.topN : MAX_SLICES, MAX_SLICES);
  const total = ranked.reduce((s, x) => s + x.value, 0);
  let slices: PieSlice[] = ranked.map((s, i) => ({ ...s, colorIndex: i }));
  if (slices.length > limit) {
    const rest = slices.slice(limit).reduce((s, x) => s + x.value, 0);
    slices = [...slices.slice(0, limit), { name: OTHER_LABEL, value: round(rest), colorIndex: -1 }];
  }
  return { slices, total: round(total), totalCategories: ranked.length, valueLabel: seriesLabel(field, agg) };
}

export interface ScatterResult {
  points: { x: number; y: number }[];
  totalPoints: number;
}

const MAX_POINTS = 3000;

export function aggregateScatter(ds: Dataset, cfg: ChartConfig): ScatterResult {
  const xf = cfg.xField;
  const yf = cfg.yFields[0];
  if (!xf || !yf) return { points: [], totalPoints: 0 };
  const all: { x: number; y: number }[] = [];
  for (const row of ds.rows) {
    const x = row[xf];
    const y = row[yf];
    if (typeof x === 'number' && typeof y === 'number') all.push({ x, y });
  }
  if (all.length <= MAX_POINTS) return { points: all, totalPoints: all.length };
  const step = all.length / MAX_POINTS;
  const points = Array.from({ length: MAX_POINTS }, (_, i) => all[Math.floor(i * step)]);
  return { points, totalPoints: all.length };
}

export interface KpiResult {
  value: number;
  label: string;
  rows: number;
}

export function aggregateKpi(ds: Dataset, cfg: ChartConfig): KpiResult {
  const field = cfg.yFields[0] ?? null;
  const agg: Aggregation = field === null ? 'count' : cfg.aggregation;
  const { groups } = groupRows(ds, { ...cfg, xField: null, includeCategories: null }, [field]);
  const acc = groups.get('All')?.[0] ?? newAcc();
  return { value: round(finish(acc, agg, field === null)), label: seriesLabel(field, agg), rows: acc.rows };
}
