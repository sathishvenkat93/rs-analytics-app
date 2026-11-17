import type { Aggregation, ChartConfig, Dataset, Row } from '../types';
import { BLANK_LABEL, CATEGORY_KEY, MAX_SERIES, OTHER_LABEL, bucketLabel, columnType, seriesLabel, type CategoryResult, type Datum, type SeriesDef } from '../lib/aggregate';
import { resolveCountry, resolveState, geoMatchRate, type GeoScope } from './geoMatch';

/* ---------- shared rollup machinery ---------- */

interface Acc {
  sum: number;
  count: number;
  rows: number;
  min: number;
  max: number;
}
const newAcc = (): Acc => ({ sum: 0, count: 0, rows: 0, min: Infinity, max: -Infinity });

function add(acc: Acc, row: Row, field: string | null) {
  acc.rows++;
  if (!field) return;
  const v = row[field];
  if (typeof v !== 'number') return;
  acc.sum += v;
  acc.count++;
  if (v < acc.min) acc.min = v;
  if (v > acc.max) acc.max = v;
}

function value(acc: Acc, agg: Aggregation, field: string | null): number {
  if (!field || agg === 'count') return field ? acc.count : acc.rows;
  if (acc.count === 0) return 0;
  const v = agg === 'sum' ? acc.sum : agg === 'avg' ? acc.sum / acc.count : agg === 'min' ? acc.min : acc.max;
  return Math.round(v * 1e6) / 1e6;
}

function measureOf(cfg: ChartConfig): { field: string | null; agg: Aggregation; label: string } {
  const field = cfg.yFields[0] ?? null;
  const agg: Aggregation = field ? cfg.aggregation : 'count';
  return { field, agg, label: seriesLabel(field, agg) };
}

/** Key function for the x column: bucketed label, honouring the include list. */
function xKeyFn(ds: Dataset, cfg: ChartConfig): (row: Row) => string | null {
  if (!cfg.xField) return () => 'All';
  const field = cfg.xField;
  const type = columnType(ds, field);
  const include = cfg.includeCategories ? new Set(cfg.includeCategories) : null;
  return (row) => {
    const k = bucketLabel(row[field], type, cfg.dateBucket);
    return include && !include.has(k) ? null : k;
  };
}

function plainKeyFn(ds: Dataset, field: string | null, bucket: ChartConfig['dateBucket'] = 'none'): (row: Row) => string {
  if (!field) return () => 'All';
  const type = columnType(ds, field);
  return (row) => bucketLabel(row[field], type, bucket);
}

function orderKeys(keys: string[], type: ReturnType<typeof columnType>): string[] {
  if (type !== 'date' && type !== 'number') return keys;
  return [...keys].sort((a, b) => {
    if (a === BLANK_LABEL) return 1;
    if (b === BLANK_LABEL) return -1;
    return type === 'number' ? Number(a) - Number(b) : a < b ? -1 : a > b ? 1 : 0;
  });
}

/** One level: key → aggregated value (insertion order = first appearance). */
function rollup1(ds: Dataset, cfg: ChartConfig, key: (r: Row) => string | null): Map<string, number> {
  const { field, agg } = measureOf(cfg);
  const accs = new Map<string, Acc>();
  for (const row of ds.rows) {
    const k = key(row);
    if (k === null) continue;
    let a = accs.get(k);
    if (!a) accs.set(k, (a = newAcc()));
    add(a, row, field);
  }
  return new Map([...accs].map(([k, a]) => [k, value(a, agg, field)]));
}

/** Two levels: outer → inner → aggregated value. */
function rollup2(ds: Dataset, cfg: ChartConfig, outer: (r: Row) => string | null, inner: (r: Row) => string | null): Map<string, Map<string, number>> {
  const { field, agg } = measureOf(cfg);
  const accs = new Map<string, Map<string, Acc>>();
  for (const row of ds.rows) {
    const a = outer(row);
    const b = inner(row);
    if (a === null || b === null) continue;
    let m = accs.get(a);
    if (!m) accs.set(a, (m = new Map()));
    let acc = m.get(b);
    if (!acc) m.set(b, (acc = newAcc()));
    add(acc, row, field);
  }
  const out = new Map<string, Map<string, number>>();
  for (const [a, m] of accs) out.set(a, new Map([...m].map(([b, acc]) => [b, value(acc, agg, field)])));
  return out;
}

function rankTotals(m: Map<string, Map<string, number>>, byInner: boolean): string[] {
  const totals = new Map<string, number>();
  for (const [a, inner] of m)
    for (const [b, v] of inner) {
      const k = byInner ? b : a;
      totals.set(k, (totals.get(k) ?? 0) + v);
    }
  return [...totals.entries()].sort((x, y) => y[1] - x[1]).map(([k]) => k);
}

/* ---------- stacked bar split by a second column ---------- */

export function aggregateSplit(ds: Dataset, cfg: ChartConfig): CategoryResult {
  const xType = columnType(ds, cfg.xField);
  const m = rollup2(ds, cfg, xKeyFn(ds, cfg), plainKeyFn(ds, cfg.groupField));
  // Segment colours follow each group's rank in the whole dataset, so filters don't repaint them.
  const ranked = rankTotals(m, true);
  const named = ranked.length > MAX_SERIES ? ranked.slice(0, MAX_SERIES - 1) : ranked;
  const hasOther = ranked.length > named.length;
  const series: SeriesDef[] = named.map((g, i) => ({ key: `g${i}`, label: g, colorIndex: i }));
  if (hasOther) series.push({ key: 'gOther', label: OTHER_LABEL, colorIndex: -1 });
  const keyOf = new Map(named.map((g, i) => [g, `g${i}`]));

  const keys = orderKeys([...m.keys()], xType);
  const totals = new Map<string, number>();
  let data: Datum[] = keys.map((k) => {
    const d: Datum = { [CATEGORY_KEY]: k };
    series.forEach((s) => (d[s.key] = 0));
    let total = 0;
    for (const [g, v] of m.get(k)!) {
      const sk = keyOf.get(g) ?? 'gOther';
      d[sk] = Math.round((Number(d[sk]) + v) * 1e6) / 1e6;
      total += v;
    }
    totals.set(k, total);
    return d;
  });
  const totalCategories = data.length;
  const { topN, sort } = cfg.options;
  if (topN > 0 && topN < data.length) {
    const keep = new Set([...keys].sort((a, b) => totals.get(b)! - totals.get(a)!).slice(0, topN));
    data = data.filter((d) => keep.has(String(d[CATEGORY_KEY])));
  }
  if (sort !== 'none') {
    const dir = sort === 'asc' ? 1 : -1;
    data = [...data].sort((a, b) => dir * (totals.get(String(a[CATEGORY_KEY]))! - totals.get(String(b[CATEGORY_KEY]))!));
  }
  return { data, series, totalCategories };
}

/* ---------- histogram ---------- */

export interface HistBin {
  label: string;
  x0: number;
  x1: number;
  count: number;
}

function niceStep(raw: number): number {
  if (raw <= 0 || !Number.isFinite(raw)) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

export function defaultBinCount(n: number): number {
  return Math.min(40, Math.max(5, Math.ceil(Math.log2(Math.max(n, 1)) + 1)));
}

export function aggregateHistogram(ds: Dataset, cfg: ChartConfig): { bins: HistBin[]; total: number; field: string | null } {
  const field = cfg.yFields[0] ?? null;
  if (!field) return { bins: [], total: 0, field };
  const vals = ds.rows.map((r) => r[field]).filter((v): v is number => typeof v === 'number');
  if (!vals.length) return { bins: [], total: 0, field };
  let min = Infinity;
  let max = -Infinity;
  for (const v of vals) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const target = cfg.options.bins > 0 ? cfg.options.bins : defaultBinCount(vals.length);
  if (min === max) return { bins: [{ label: String(min), x0: min, x1: max, count: vals.length }], total: vals.length, field };
  const step = niceStep((max - min) / target);
  const start = Math.floor(min / step) * step;
  const count = Math.max(1, Math.ceil((max - start) / step + 1e-9));
  const bins: HistBin[] = Array.from({ length: count }, (_, i) => {
    const x0 = Math.round((start + i * step) * 1e9) / 1e9;
    const x1 = Math.round((start + (i + 1) * step) * 1e9) / 1e9;
    return { x0, x1, count: 0, label: '' };
  });
  for (const v of vals) bins[Math.min(count - 1, Math.floor((v - start) / step))].count++;
  const fmt = new Intl.NumberFormat(undefined, { notation: Math.abs(max) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 2 });
  bins.forEach((b) => (b.label = `${fmt.format(b.x0)}–${fmt.format(b.x1)}`));
  return { bins, total: vals.length, field };
}

/* ---------- ranked (pareto, pictograph, funnel) ---------- */

export interface RankedItem {
  name: string;
  value: number;
  share: number;
  cumShare: number;
  isOther?: boolean;
}

export function aggregateRanked(ds: Dataset, cfg: ChartConfig, opts: { foldOther: boolean; limit?: number }): { items: RankedItem[]; total: number; totalCategories: number; label: string } {
  const { label } = measureOf(cfg);
  const m = rollup1(ds, cfg, xKeyFn(ds, cfg));
  let list = [...m.entries()].map(([name, value]) => ({ name, value })).filter((x) => x.value > 0);
  list.sort((a, b) => b.value - a.value);
  const total = list.reduce((s, x) => s + x.value, 0);
  const totalCategories = list.length;
  const limit = opts.limit ?? (cfg.options.topN > 0 ? cfg.options.topN : 0);
  if (limit > 0 && list.length > limit) {
    const rest = list.slice(limit).reduce((s, x) => s + x.value, 0);
    list = list.slice(0, limit);
    if (opts.foldOther) list.push({ name: OTHER_LABEL, value: rest, isOther: true } as RankedItem);
  }
  let cum = 0;
  const items = list.map((x) => {
    cum += x.value;
    return { ...x, share: total ? x.value / total : 0, cumShare: total ? cum / total : 0 };
  });
  return { items, total, totalCategories, label };
}

/* ---------- waterfall ---------- */

export interface WaterfallStep {
  name: string;
  delta: number;
  range: [number, number];
  kind: 'up' | 'down' | 'total';
  running: number;
}

export function aggregateWaterfall(ds: Dataset, cfg: ChartConfig): { steps: WaterfallStep[]; label: string } {
  const { label } = measureOf(cfg);
  const m = rollup1(ds, cfg, xKeyFn(ds, cfg));
  const keys = orderKeys([...m.keys()], columnType(ds, cfg.xField));
  let running = 0;
  const steps: WaterfallStep[] = keys.map((k) => {
    const delta = m.get(k)!;
    const start = running;
    running += delta;
    return { name: k, delta, range: [Math.min(start, running), Math.max(start, running)], kind: delta >= 0 ? 'up' : 'down', running };
  });
  if (steps.length) steps.push({ name: 'Total', delta: running, range: [Math.min(0, running), Math.max(0, running)], kind: 'total', running });
  return { steps, label };
}

/* ---------- treemap ---------- */

export interface TreeNode {
  name: string;
  value: number;
  colorIndex: number;
  parent?: string;
  children?: TreeNode[];
}

export function aggregateTreemap(ds: Dataset, cfg: ChartConfig): { nodes: TreeNode[]; total: number; label: string; totalCategories: number } {
  const { label } = measureOf(cfg);
  const outer = xKeyFn(ds, cfg);
  let nodes: TreeNode[];
  if (cfg.groupField) {
    const m = rollup2(ds, cfg, outer, plainKeyFn(ds, cfg.groupField));
    nodes = [...m.entries()].map(([name, inner]) => {
      const children = [...inner.entries()].filter(([, v]) => v > 0).map(([c, v]) => ({ name: c, value: v, colorIndex: 0, parent: name }));
      return { name, value: children.reduce((s, c) => s + c.value, 0), colorIndex: 0, children };
    });
  } else {
    nodes = [...rollup1(ds, cfg, outer).entries()].map(([name, value]) => ({ name, value, colorIndex: 0 }));
  }
  nodes = nodes.filter((n) => n.value > 0).sort((a, b) => b.value - a.value);
  const totalCategories = nodes.length;
  const limit = cfg.options.topN > 0 ? cfg.options.topN : 0;
  if (limit && nodes.length > limit) nodes = nodes.slice(0, limit);
  nodes.forEach((n, i) => {
    n.colorIndex = i < MAX_SERIES ? i : -1;
    n.children?.forEach((c) => (c.colorIndex = n.colorIndex));
  });
  return { nodes, total: nodes.reduce((s, n) => s + n.value, 0), label, totalCategories };
}

/* ---------- sankey ---------- */

export interface SankeyData {
  nodes: { name: string; side: 'source' | 'target'; colorIndex: number }[];
  links: { source: number; target: number; value: number }[];
  label: string;
}

const SANKEY_SIDE_MAX = 10;

export function aggregateSankey(ds: Dataset, cfg: ChartConfig): SankeyData {
  const { label } = measureOf(cfg);
  const m = rollup2(ds, cfg, xKeyFn(ds, cfg), plainKeyFn(ds, cfg.groupField));
  const fold = (ranked: string[]) => {
    const keep = ranked.length > SANKEY_SIDE_MAX ? ranked.slice(0, SANKEY_SIDE_MAX - 1) : ranked;
    return { keep: new Set(keep), list: ranked.length > keep.length ? [...keep, OTHER_LABEL] : keep };
  };
  const src = fold(rankTotals(m, false));
  const tgt = fold(rankTotals(m, true));
  const nodes: SankeyData['nodes'] = [
    ...src.list.map((name, i) => ({ name, side: 'source' as const, colorIndex: name === OTHER_LABEL ? -1 : i < MAX_SERIES ? i : -1 })),
    ...tgt.list.map((name) => ({ name, side: 'target' as const, colorIndex: -1 })),
  ];
  const srcIndex = new Map(src.list.map((n, i) => [n, i]));
  const tgtIndex = new Map(tgt.list.map((n, i) => [n, src.list.length + i]));
  const linkMap = new Map<string, number>();
  for (const [a, inner] of m)
    for (const [b, v] of inner) {
      if (v <= 0) continue;
      const s = srcIndex.get(src.keep.has(a) ? a : OTHER_LABEL)!;
      const t = tgtIndex.get(tgt.keep.has(b) ? b : OTHER_LABEL)!;
      const k = `${s}|${t}`;
      linkMap.set(k, (linkMap.get(k) ?? 0) + v);
    }
  const links = [...linkMap.entries()].map(([k, value]) => {
    const [source, target] = k.split('|').map(Number);
    return { source, target, value };
  });
  return { nodes, links, label };
}

/* ---------- candlestick ---------- */

export interface Candle {
  name: string;
  open: number;
  high: number;
  low: number;
  close: number;
  range: [number, number];
}

export function aggregateCandles(ds: Dataset, cfg: ChartConfig): Candle[] {
  const { open, high, low, close } = cfg.extra;
  if (!cfg.xField || !open || !high || !low || !close) return [];
  const key = plainKeyFn(ds, cfg.xField, cfg.dateBucket);
  const rows = ds.rows
    .filter((r) => typeof r[cfg.xField!] === 'string' && [open, high, low, close].every((f) => typeof r[f] === 'number'))
    .sort((a, b) => String(a[cfg.xField!]).localeCompare(String(b[cfg.xField!])));
  const out = new Map<string, Candle>();
  for (const r of rows) {
    const k = key(r);
    const o = r[open] as number;
    const h = r[high] as number;
    const l = r[low] as number;
    const c = r[close] as number;
    const cur = out.get(k);
    if (!cur) out.set(k, { name: k, open: o, high: h, low: l, close: c, range: [l, h] });
    else {
      cur.high = Math.max(cur.high, h);
      cur.low = Math.min(cur.low, l);
      cur.close = c;
      cur.range = [cur.low, cur.high];
    }
  }
  return [...out.values()];
}

/* ---------- heatmap ---------- */

export interface HeatmapData {
  cols: string[];
  rows: string[];
  cells: Map<string, number>;
  min: number;
  max: number;
  label: string;
  truncated: boolean;
}

export const heatKey = (r: string, c: string) => `${r}\u0001${c}`;

export function aggregateHeatmap(ds: Dataset, cfg: ChartConfig): HeatmapData {
  const { label } = measureOf(cfg);
  const m = rollup2(ds, cfg, plainKeyFn(ds, cfg.groupField), xKeyFn(ds, cfg));
  let rows = orderKeys([...m.keys()], columnType(ds, cfg.groupField));
  const colSet = new Set<string>();
  for (const inner of m.values()) for (const c of inner.keys()) colSet.add(c);
  let cols = orderKeys([...colSet], columnType(ds, cfg.xField));
  let truncated = false;
  if (rows.length > 30) {
    const ranked = rankTotals(m, false).slice(0, 30);
    rows = rows.filter((r) => ranked.includes(r));
    truncated = true;
  }
  if (cols.length > 40) {
    cols = cols.slice(0, 40);
    truncated = true;
  }
  const cells = new Map<string, number>();
  let min = Infinity;
  let max = -Infinity;
  for (const r of rows)
    for (const c of cols) {
      const v = m.get(r)?.get(c);
      if (v === undefined) continue;
      cells.set(heatKey(r, c), v);
      if (v < min) min = v;
      if (v > max) max = v;
    }
  return { rows, cols, cells, min, max, label, truncated };
}

/* ---------- box plot ---------- */

export interface BoxStats {
  name: string;
  n: number;
  q1: number;
  median: number;
  q3: number;
  lo: number;
  hi: number;
  mean: number;
  outliers: number[];
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

export function aggregateBoxes(ds: Dataset, cfg: ChartConfig): { boxes: BoxStats[]; totalGroups: number } {
  const field = cfg.yFields[0];
  if (!field) return { boxes: [], totalGroups: 0 };
  const key = xKeyFn(ds, cfg);
  const groups = new Map<string, number[]>();
  for (const row of ds.rows) {
    const k = key(row);
    const v = row[field];
    if (k === null || typeof v !== 'number') continue;
    let arr = groups.get(k);
    if (!arr) groups.set(k, (arr = []));
    arr.push(v);
  }
  let keys = orderKeys([...groups.keys()], columnType(ds, cfg.xField));
  const totalGroups = keys.length;
  if (keys.length > 15) keys = [...keys].sort((a, b) => groups.get(b)!.length - groups.get(a)!.length).slice(0, 15);
  const boxes = keys.map((name) => {
    const s = groups.get(name)!.sort((a, b) => a - b);
    const q1 = quantile(s, 0.25);
    const median = quantile(s, 0.5);
    const q3 = quantile(s, 0.75);
    const iqr = q3 - q1;
    const loFence = q1 - 1.5 * iqr;
    const hiFence = q3 + 1.5 * iqr;
    const inside = s.filter((v) => v >= loFence && v <= hiFence);
    return {
      name,
      n: s.length,
      q1,
      median,
      q3,
      lo: inside[0] ?? q1,
      hi: inside[inside.length - 1] ?? q3,
      mean: s.reduce((a, b) => a + b, 0) / s.length,
      outliers: s.filter((v) => v < loFence || v > hiFence),
    };
  });
  return { boxes, totalGroups };
}

/* ---------- gantt ---------- */

export interface GanttTask {
  name: string;
  start: number;
  end: number;
  group: string | null;
}

export function aggregateGantt(ds: Dataset, cfg: ChartConfig): { tasks: GanttTask[]; groups: string[]; total: number } {
  const { start, end } = cfg.extra;
  if (!cfg.xField || !start || !end) return { tasks: [], groups: [], total: 0 };
  const all: GanttTask[] = [];
  for (const r of ds.rows) {
    const s = r[start];
    const e = r[end];
    if (typeof s !== 'string' || typeof e !== 'string') continue;
    const t0 = Date.parse(s);
    const t1 = Date.parse(e);
    if (Number.isNaN(t0) || Number.isNaN(t1)) continue;
    all.push({ name: String(r[cfg.xField] ?? BLANK_LABEL), start: Math.min(t0, t1), end: Math.max(t0, t1) + 86_400_000, group: cfg.groupField ? String(r[cfg.groupField] ?? BLANK_LABEL) : null });
  }
  all.sort((a, b) => a.start - b.start);
  const groups: string[] = [];
  for (const t of all) if (t.group !== null && !groups.includes(t.group)) groups.push(t.group);
  return { tasks: all.slice(0, 60), groups, total: all.length };
}

/* ---------- geo ---------- */

export interface GeoAgg {
  scope: GeoScope;
  values: Map<string, number>;
  unmatched: string[];
  label: string;
}

export function aggregateGeo(ds: Dataset, cfg: ChartConfig): GeoAgg {
  const { label } = measureOf(cfg);
  const field = cfg.xField;
  if (!field) return { scope: 'world', values: new Map(), unmatched: [], label };
  const distinct = [...new Set(ds.rows.map((r) => r[field]).filter((v): v is string => typeof v === 'string'))];
  const { scope } = geoMatchRate(distinct);
  const resolve = scope === 'usa' ? resolveState : resolveCountry;
  const unmatched = new Set<string>();
  const m = rollup1(ds, cfg, (row) => {
    const name = resolve(row[field]);
    if (!name && typeof row[field] === 'string') unmatched.add(row[field] as string);
    return name;
  });
  return { scope, values: m, unmatched: [...unmatched], label };
}

export function aggregatePoints(ds: Dataset, cfg: ChartConfig): { points: { lat: number; lon: number; size: number | null }[]; total: number } {
  const { lat, lon } = cfg.extra;
  if (!lat || !lon) return { points: [], total: 0 };
  const size = cfg.sizeField;
  const all = ds.rows
    .filter((r) => typeof r[lat] === 'number' && typeof r[lon] === 'number')
    .map((r) => ({ lat: r[lat] as number, lon: r[lon] as number, size: size && typeof r[size] === 'number' ? (r[size] as number) : null }));
  return { points: all.slice(0, 3000), total: all.length };
}
