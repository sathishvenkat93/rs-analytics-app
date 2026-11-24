import type { ColumnType, Dataset } from '../types';
import { geoMatchRate, type GeoScope } from './geoMatch';

export interface ColumnProfile {
  name: string;
  type: ColumnType;
  distinct: number;
  nonNull: number;
  hasNegative: boolean;
  min: number;
  max: number;
}

/** What a dataset contains, as far as choosing a chart is concerned. */
export interface DatasetProfile {
  rows: number;
  columns: ColumnProfile[];
  /** Numeric columns that read as measures (not IDs, codes or coordinates). */
  measures: ColumnProfile[];
  dates: ColumnProfile[];
  /** Text columns with a manageable number of distinct values (2–60). */
  categories: ColumnProfile[];
  /** Text columns with many distinct values (names, IDs, tasks). */
  labels: ColumnProfile[];
  geo: { column: string; scope: GeoScope; rate: number } | null;
  lat: string | null;
  lon: string | null;
  ohlc: { open: string; high: string; low: string; close: string } | null;
  start: string | null;
  end: string | null;
  task: string | null;
}

const NOT_A_MEASURE = /(^id$|[_\s-]id$|^id[_\s-]|zip|postal|phone|code$|^year$|^month$|^day$|^week$|^lat(itude)?$|^lon(g|gitude)?$|^lng$)/i;
const cache = new WeakMap<Dataset, DatasetProfile>();

function profileColumn(ds: Dataset, name: string, type: ColumnType): ColumnProfile {
  const seen = new Set<string | number>();
  let nonNull = 0;
  let hasNegative = false;
  let min = Infinity;
  let max = -Infinity;
  for (const row of ds.rows) {
    const v = row[name];
    if (v === null || v === undefined || v === '') continue;
    nonNull++;
    if (seen.size <= 5000) seen.add(v);
    if (typeof v === 'number') {
      if (v < 0) hasNegative = true;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return { name, type, distinct: seen.size, nonNull, hasNegative, min, max };
}

function byName(cols: ColumnProfile[], re: RegExp): ColumnProfile | undefined {
  return cols.find((c) => re.test(c.name));
}

export function profileDataset(ds: Dataset): DatasetProfile {
  const hit = cache.get(ds);
  if (hit) return hit;

  const columns = ds.columns.map((c) => profileColumn(ds, c.name, c.type));
  const numeric = columns.filter((c) => c.type === 'number' && c.nonNull > 0);
  const dates = columns.filter((c) => c.type === 'date' && c.distinct > 1);
  const strings = columns.filter((c) => c.type === 'string' && c.nonNull > 0);
  // Identifier columns aren't categories. Judged by name: a unique label per row is normal in
  // aggregated tables (a SQL result of month → revenue), and categories are capped at 60 values anyway.
  const idLike = (c: ColumnProfile) => /(^id$|[_\s.-]id$|^uuid$|^guid$)/i.test(c.name);
  const categories = strings.filter((c) => c.distinct >= 2 && c.distinct <= 60 && !idLike(c));
  const labels = strings.filter((c) => c.distinct > 60 || (c.distinct > 1 && c.distinct >= ds.rows.length * 0.8));

  const latCol = numeric.find((c) => /^(lat|latitude)$|[_\s]lat(itude)?$/i.test(c.name) && c.min >= -90 && c.max <= 90);
  const lonCol = numeric.find((c) => /^(lon|lng|long|longitude)$|[_\s](lon|lng|longitude)$/i.test(c.name) && c.min >= -180 && c.max <= 180);

  const open = byName(numeric, /\bopen\b/i);
  const high = byName(numeric, /\bhigh\b/i);
  const low = byName(numeric, /\blow\b/i);
  const close = byName(numeric, /\bclose\b|adj\.? ?close/i);
  const ohlc = open && high && low && close ? { open: open.name, high: high.name, low: low.name, close: close.name } : null;

  const start = byName(dates, /start|begin|from|kick/i) ?? (dates.length >= 2 ? dates[0] : undefined);
  const end = byName(dates, /end|finish|due|until|to\b|complete/i) ?? (dates.length >= 2 ? dates.find((d) => d !== start) : undefined);
  const task = byName(strings, /task|activity|milestone|phase|deliverable|work ?item|step/i) ?? (start && end ? strings[0] : undefined);

  let geo: DatasetProfile['geo'] = null;
  for (const c of strings) {
    if (c.distinct > 300) continue;
    const distinct = [...new Set(ds.rows.map((r) => r[c.name]).filter((v): v is string => typeof v === 'string'))];
    const m = geoMatchRate(distinct);
    if (m.rate >= 0.6 && (!geo || m.rate > geo.rate)) geo = { column: c.name, ...m };
  }

  const special = new Set([latCol?.name, lonCol?.name].filter(Boolean));
  // Summable money/volume measures first; rates, prices and scores (which shouldn't be summed) last.
  const rank = (c: ColumnProfile) =>
    /revenue|sales|amount|value|total|income|spend|profit|margin|cost|gmv|budget/i.test(c.name)
      ? 0
      : /units|qty|quantity|volume|deals|orders|visitors|users|count|headcount/i.test(c.name)
        ? 1
        : /price|rate|ratio|%|percent|pct|avg|average|mean|score|rating|age|progress/i.test(c.name)
          ? 3
          : 2;
  const measures = numeric
    .filter((c) => !special.has(c.name) && !NOT_A_MEASURE.test(c.name))
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map(({ c }) => c);

  const profile: DatasetProfile = {
    rows: ds.rows.length,
    columns,
    measures,
    dates,
    categories,
    labels,
    geo,
    lat: latCol && lonCol ? latCol.name : null,
    lon: latCol && lonCol ? lonCol.name : null,
    ohlc: ohlc && dates.length ? ohlc : null,
    start: start && end ? start.name : null,
    end: start && end ? end.name : null,
    task: start && end && task ? task.name : null,
  };
  cache.set(ds, profile);
  return profile;
}
