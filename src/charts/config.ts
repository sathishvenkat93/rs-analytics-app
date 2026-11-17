import type { ChartConfig, ChartType, Dataset, FieldRole } from '../types';
import { DEFAULT_OPTIONS } from '../types';
import { seriesLabel } from '../lib/aggregate';
import { uid } from '../lib/id';
import { CHART_DEFS, type Picks } from './registry';
import { profileDataset } from './profile';

export function getRole(cfg: ChartConfig, role: FieldRole): string | null {
  switch (role) {
    case 'x':
      return cfg.xField;
    case 'y':
      return cfg.yFields[0] ?? null;
    case 'group':
      return cfg.groupField;
    case 'size':
      return cfg.sizeField;
    default:
      return cfg.extra[role] ?? null;
  }
}

export function setRole(cfg: ChartConfig, role: FieldRole, value: string | null): ChartConfig {
  switch (role) {
    case 'x':
      return { ...cfg, xField: value, includeCategories: null };
    case 'y':
      return { ...cfg, yFields: value ? [value] : [], aggregation: value ? (cfg.yFields.length ? cfg.aggregation : 'sum') : 'count' };
    case 'group':
      return { ...cfg, groupField: value };
    case 'size':
      return { ...cfg, sizeField: value };
    default: {
      const extra = { ...cfg.extra };
      if (value) extra[role] = value;
      else delete extra[role];
      return { ...cfg, extra };
    }
  }
}

/** Pick a date grouping that gives a useful number of points for the column's span. */
export function bucketForSpan(ds: Dataset | undefined, field: string | null): ChartConfig['dateBucket'] {
  if (!ds || !field) return 'month';
  let min = '';
  let max = '';
  for (const r of ds.rows) {
    const v = r[field];
    if (typeof v !== 'string') continue;
    if (!min || v < min) min = v;
    if (!max || v > max) max = v;
  }
  const days = (Date.parse(max) - Date.parse(min)) / 86_400_000;
  if (!Number.isFinite(days) || days <= 62) return 'day';
  if (days <= 3 * 365) return 'month';
  if (days <= 8 * 365) return 'quarter';
  return 'year';
}

function applyPicks(cfg: ChartConfig, picks: Picks, ds: Dataset | undefined): ChartConfig {
  let next = { ...cfg };
  for (const [role, v] of Object.entries(picks) as [FieldRole, string | string[]][]) {
    if (role === 'y') next = { ...next, yFields: Array.isArray(v) ? v : [v] };
    else next = setRole(next, role, Array.isArray(v) ? v[0] ?? null : v);
  }
  next.aggregation = next.yFields.length ? 'sum' : 'count';
  const xType = ds?.columns.find((c) => c.name === next.xField)?.type;
  next.dateBucket = xType === 'date' && CHART_DEFS[next.type].bucket ? (next.type === 'candlestick' ? 'day' : bucketForSpan(ds, next.xField)) : 'none';
  return next;
}

/** A new chart of `type`, with columns pre-picked by the type's fit check. */
export function blankConfig(ds: Dataset | undefined, type: ChartType): ChartConfig {
  const def = CHART_DEFS[type];
  const base: ChartConfig = {
    id: uid('c_'),
    title: '',
    type,
    datasetId: ds?.id ?? '',
    xField: null,
    yFields: [],
    groupField: null,
    sizeField: null,
    extra: {},
    aggregation: 'count',
    dateBucket: 'none',
    includeCategories: null,
    options: { ...DEFAULT_OPTIONS, ...def.defaultOptions, width: def.defaultWidth ?? 'half' },
  };
  if (!ds) return base;
  return applyPicks(base, def.suggest(profileDataset(ds)).picks, ds);
}

/** Switching type: start from the new type's suggestion, keep compatible user choices. */
export function retarget(cfg: ChartConfig, ds: Dataset | undefined, type: ChartType): ChartConfig {
  const fresh = blankConfig(ds, type);
  const def = CHART_DEFS[type];
  const colType = (name: string | null) => ds?.columns.find((c) => c.name === name)?.type;
  let next: ChartConfig = { ...fresh, id: cfg.id, title: cfg.title };
  for (const spec of def.fields) {
    if (spec.role === 'y') {
      const ok = cfg.yFields.filter((f) => colType(f) === 'number');
      if (ok.length) next = { ...next, yFields: spec.multi ? ok.slice(0, spec.max ?? 8) : [ok[0]], aggregation: cfg.aggregation };
      continue;
    }
    const v = getRole(cfg, spec.role);
    const t = colType(v);
    if (v && t && spec.accepts.includes(t)) next = setRole(next, spec.role, v);
  }
  if (next.xField === cfg.xField) {
    next.includeCategories = cfg.includeCategories;
    if (def.bucket) next.dateBucket = cfg.dateBucket;
  }
  return next;
}

/** Brings configs saved by older versions up to the current shape. */
export function normalizeConfig(c: ChartConfig): ChartConfig {
  const cfg: ChartConfig = {
    ...c,
    groupField: c.groupField ?? null,
    sizeField: c.sizeField ?? null,
    extra: c.extra ?? {},
    options: { ...DEFAULT_OPTIONS, ...c.options },
  };
  // v1 stored donuts as pie + donut option.
  if (cfg.type === 'pie' && c.options?.donut) cfg.type = 'donut';
  if (!CHART_DEFS[cfg.type]) cfg.type = 'bar';
  return cfg;
}

export function validate(cfg: ChartConfig, ds: Dataset | undefined): string | null {
  if (!ds) return 'Pick a dataset.';
  const def = CHART_DEFS[cfg.type];
  for (const spec of def.fields) {
    if (!spec.required) continue;
    const has = spec.role === 'y' ? cfg.yFields.length > 0 : !!getRole(cfg, spec.role);
    if (!has) return `Choose a column for “${spec.label}”.`;
  }
  if (cfg.type === 'sankey' && cfg.xField === cfg.groupField) return 'Source and target must be different columns.';
  if (cfg.type === 'heatmap' && cfg.xField === cfg.groupField) return 'Rows and columns must be different columns.';
  if (cfg.includeCategories && cfg.includeCategories.length === 0) return 'Select at least one label value.';
  return null;
}

export function autoTitle(cfg: ChartConfig): string {
  const y = cfg.yFields;
  const agg = y.length ? cfg.aggregation : 'count';
  const measure = y.length > 1 ? y.slice(0, 2).join(' & ') + (y.length > 2 ? ' …' : '') : seriesLabel(y[0] ?? null, agg);
  const bucket = cfg.dateBucket !== 'none' && cfg.dateBucket !== 'day' ? ` (${cfg.dateBucket})` : '';
  const by = cfg.xField ? ` by ${cfg.xField}${bucket}` : '';
  switch (cfg.type) {
    case 'kpi':
      return agg === 'sum' && y[0] ? `Total ${y[0]}` : measure;
    case 'sparkline':
      return `${measure} trend`;
    case 'scatter':
      return y[0] && cfg.xField ? `${y[0]} vs ${cfg.xField}` : 'Scatter plot';
    case 'bubble':
      return y[0] && cfg.xField ? `${y[0]} vs ${cfg.xField}${cfg.sizeField ? `, sized by ${cfg.sizeField}` : ''}` : 'Bubble chart';
    case 'pie':
    case 'donut':
      return cfg.xField ? `${measure} share by ${cfg.xField}` : measure;
    case 'histogram':
      return y[0] ? `Distribution of ${y[0]}` : 'Histogram';
    case 'boxplot':
      return y[0] ? `Spread of ${y[0]}${cfg.xField ? ` by ${cfg.xField}` : ''}` : 'Box plot';
    case 'stacked':
      return cfg.groupField ? `${measure}${by}, split by ${cfg.groupField}` : `${measure}${by}`;
    case 'treemap':
      return `${measure} by ${cfg.xField ?? ''}${cfg.groupField ? ` › ${cfg.groupField}` : ''}`;
    case 'pareto':
      return `Pareto of ${measure}${by}`;
    case 'funnel':
      return `${measure} funnel${by}`;
    case 'waterfall':
      return `${measure} waterfall${by}`;
    case 'sankey':
      return cfg.xField && cfg.groupField ? `${cfg.xField} → ${cfg.groupField}` : 'Sankey diagram';
    case 'candlestick':
      return cfg.extra.close ? `${cfg.extra.close} price${bucket}` : 'Candlestick chart';
    case 'geo':
      return `${measure} by ${cfg.xField ?? 'location'}`;
    case 'geobubble':
      return `${measure} by ${cfg.xField ?? 'location'} (bubbles)`;
    case 'scattermap':
      return 'Locations';
    case 'heatmap':
      return cfg.groupField && cfg.xField ? `${measure}: ${cfg.groupField} × ${cfg.xField}${bucket}` : 'Heatmap';
    case 'gantt':
      return cfg.xField ? `${cfg.xField} timeline` : 'Timeline';
    default:
      return `${measure}${by}`;
  }
}
