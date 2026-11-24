import type { AiChartSpec } from '../../shared/ai';
import type { ChartConfig, Dataset, ExtraRole, FieldRole } from '../types';
import { CHART_DEFS } from '../charts/registry';
import { blankConfig, bucketForSpan, getRole, setRole, validate } from '../charts/config';
import { distinctCategories } from '../lib/aggregate';

/**
 * Model chart spec ⇄ app ChartConfig. Every column the model names is checked
 * against the dataset and the chart type's accepted column types; anything
 * that doesn't fit is replaced by the app's own suggestion and reported.
 */

export interface SpecResult {
  config: ChartConfig;
  /** Plain-language notes about what had to be adjusted. Empty = used as given. */
  issues: string[];
  /** Validation error left after repairs, if the chart still can't render. */
  error: string | null;
}

const EXTRA: ExtraRole[] = ['open', 'high', 'low', 'close', 'start', 'end', 'lat', 'lon'];

function specValue(spec: AiChartSpec, role: FieldRole): string | null {
  if (role === 'x') return spec.x;
  if (role === 'group') return spec.group;
  if (role === 'size') return spec.size;
  if (role === 'y') return spec.y[0] ?? null;
  return spec.extra[role as ExtraRole] ?? null;
}

/** Case-insensitive column match, since models sometimes change capitalisation. */
function findColumn(ds: Dataset, name: string | null) {
  if (!name) return undefined;
  return ds.columns.find((c) => c.name === name) ?? ds.columns.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
}

export function specToConfig(spec: AiChartSpec, ds: Dataset, base?: ChartConfig): SpecResult {
  const def = CHART_DEFS[spec.type] ?? CHART_DEFS.bar;
  const issues: string[] = [];
  // Start from the app's own suggestion for this type, so unfilled slots get sensible columns.
  const fresh = blankConfig(ds, def.type);
  let cfg: ChartConfig = { ...fresh, id: base?.id ?? fresh.id, options: { ...fresh.options, ...(base?.type === def.type ? { width: base.options.width } : {}) } };

  for (const f of def.fields) {
    if (f.role === 'y') {
      const wanted = spec.y.length ? spec.y : [];
      const ok = wanted.map((n) => findColumn(ds, n)).filter((c) => c && f.accepts.includes(c.type)).map((c) => c!.name);
      const dropped = wanted.filter((n) => !ok.some((o) => o.toLowerCase() === n.toLowerCase()));
      if (dropped.length) issues.push(`Ignored ${dropped.map((d) => `“${d}”`).join(', ')}: not a numeric column in ${ds.name}.`);
      if (ok.length) cfg = { ...cfg, yFields: f.multi ? ok.slice(0, f.max ?? 8) : [ok[0]] };
      else if (!wanted.length && spec.aggregation === 'count' && !f.required) cfg = { ...cfg, yFields: [] };
      continue;
    }
    const wanted = specValue(spec, f.role);
    const col = findColumn(ds, wanted);
    if (wanted && col && f.accepts.includes(col.type)) cfg = setRole(cfg, f.role, col.name);
    else if (wanted) issues.push(`“${wanted}” can’t be used as ${f.label.toLowerCase()}${col ? ` (it’s ${col.type})` : ' (no such column)'}; used ${getRole(cfg, f.role) ?? 'nothing'} instead.`);
    else if (!f.required) cfg = setRole(cfg, f.role, null);
  }

  cfg.aggregation = cfg.yFields.length ? (spec.aggregation === 'count' && def.aggregate ? 'count' : spec.aggregation) : 'count';
  const xType = ds.columns.find((c) => c.name === cfg.xField)?.type;
  cfg.dateBucket = xType === 'date' && def.bucket ? (spec.dateBucket !== 'none' ? spec.dateBucket : bucketForSpan(ds, cfg.xField)) : 'none';
  cfg.title = spec.title.trim();
  cfg.options = {
    ...cfg.options,
    topN: spec.topN && spec.topN > 0 ? Math.round(spec.topN) : 0,
    sort: spec.sort,
    stacked: spec.stacked || def.type === 'stacked',
    horizontal: def.type === 'bar' || def.type === 'column' || def.type === 'stacked' ? spec.horizontal : cfg.options.horizontal,
    showLabels: spec.showLabels,
  };

  if (spec.includeCategories?.length && cfg.xField && def.filter) {
    const all = distinctCategories(ds, cfg.xField, cfg.dateBucket);
    const lower = new Map(all.map((v) => [v.toLowerCase(), v]));
    const keep = spec.includeCategories.map((v) => lower.get(String(v).toLowerCase())).filter((v): v is string => !!v);
    if (keep.length) cfg.includeCategories = keep.length === all.length ? null : [...new Set(keep)];
    else issues.push(`None of the requested ${cfg.xField} values (${spec.includeCategories.slice(0, 3).join(', ')}) exist, so no filter was applied.`);
  } else cfg.includeCategories = null;

  return { config: cfg, issues, error: validate(cfg, ds) };
}

export function configToSpec(cfg: ChartConfig): AiChartSpec {
  const extra = Object.fromEntries(EXTRA.map((k) => [k, cfg.extra[k] ?? null])) as AiChartSpec['extra'];
  return {
    type: cfg.type,
    title: cfg.title,
    x: cfg.xField,
    y: cfg.yFields,
    group: cfg.groupField,
    size: cfg.sizeField,
    extra,
    aggregation: cfg.aggregation,
    dateBucket: cfg.dateBucket,
    topN: cfg.options.topN || null,
    sort: cfg.options.sort,
    stacked: cfg.options.stacked,
    horizontal: cfg.options.horizontal,
    showLabels: cfg.options.showLabels,
    includeCategories: cfg.includeCategories,
    rationale: '',
  };
}
