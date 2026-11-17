import { useEffect, useMemo, useState } from 'react';
import type { Aggregation, ChartConfig, ChartType, Column, Dataset, DateBucket } from '../types';
import { DEFAULT_OPTIONS } from '../types';
import { AGG_LABEL, MAX_SERIES, distinctCategories, seriesLabel } from '../lib/aggregate';
import { uid } from '../lib/id';
import { Modal } from './Modal';
import { ChartRenderer } from './ChartRenderer';
import { ChartTypeIcon, IconBack } from './icons';
import { Segmented } from './Segmented';

interface Props {
  datasets: Dataset[];
  defaultDatasetId: string | null;
  initial?: ChartConfig;
  onSubmit: (cfg: ChartConfig) => void;
  onClose: () => void;
}

const CHART_TYPES: { type: ChartType; name: string; hint: string }[] = [
  { type: 'bar', name: 'Bar chart', hint: 'Compare values across categories' },
  { type: 'line', name: 'Line chart', hint: 'Show a trend over time or ordered labels' },
  { type: 'area', name: 'Area chart', hint: 'Trend with volume, optionally stacked' },
  { type: 'pie', name: 'Pie / donut', hint: 'Composition: each part’s share of a whole' },
  { type: 'scatter', name: 'Scatter plot', hint: 'Relationship between two numeric columns' },
  { type: 'kpi', name: 'KPI number', hint: 'One headline figure, e.g. total revenue' },
];

const AGGS: Aggregation[] = ['sum', 'avg', 'count', 'min', 'max'];
const BUCKETS: { v: DateBucket; label: string }[] = [
  { v: 'day', label: 'Day' },
  { v: 'month', label: 'Month' },
  { v: 'quarter', label: 'Quarter' },
  { v: 'year', label: 'Year' },
];

const ROW_COUNT = '__rows__';

function numericCols(ds: Dataset | undefined): Column[] {
  return ds?.columns.filter((c) => c.type === 'number') ?? [];
}

function pickDefaultX(ds: Dataset, type: ChartType): string | null {
  const byType = (t: Column['type']) => ds.columns.find((c) => c.type === t)?.name;
  if (type === 'scatter') return numericCols(ds)[0]?.name ?? null;
  if (type === 'kpi') return null;
  if (type === 'line' || type === 'area') return byType('date') ?? byType('string') ?? ds.columns[0]?.name ?? null;
  return byType('string') ?? byType('date') ?? ds.columns[0]?.name ?? null;
}

function blankConfig(ds: Dataset | undefined, type: ChartType): ChartConfig {
  const nums = numericCols(ds);
  const xField = ds ? pickDefaultX(ds, type) : null;
  const xType = ds?.columns.find((c) => c.name === xField)?.type;
  let yFields: string[] = nums[0] ? [nums[0].name] : [];
  if (type === 'scatter') yFields = nums[1] ? [nums[1].name] : nums[0] ? [nums[0].name] : [];
  return {
    id: uid('c_'),
    title: '',
    type,
    datasetId: ds?.id ?? '',
    xField,
    yFields,
    aggregation: yFields.length ? 'sum' : 'count',
    dateBucket: xType === 'date' ? 'month' : 'none',
    includeCategories: null,
    options: { ...DEFAULT_OPTIONS, width: type === 'kpi' ? 'third' : 'half' },
  };
}

/** Carries compatible choices across when the user changes chart type. */
function retarget(cfg: ChartConfig, ds: Dataset | undefined, type: ChartType): ChartConfig {
  const fresh = blankConfig(ds, type);
  const isNum = (f: string | null) => !!f && numericCols(ds).some((c) => c.name === f);
  const categoryType = (t: ChartType) => t === 'bar' || t === 'line' || t === 'area' || t === 'pie';
  const next: ChartConfig = { ...fresh, id: cfg.id, title: cfg.title, options: { ...cfg.options, width: fresh.options.width } };
  if (categoryType(type) && categoryType(cfg.type) && cfg.xField) {
    next.xField = cfg.xField;
    next.dateBucket = cfg.dateBucket;
    next.includeCategories = cfg.includeCategories;
  }
  if (type === 'scatter' && isNum(cfg.xField)) next.xField = cfg.xField;
  const validY = cfg.yFields.filter(isNum);
  if (validY.length) {
    next.yFields = type === 'bar' || type === 'line' || type === 'area' ? validY : [validY[0]];
    next.aggregation = cfg.aggregation;
  } else if (cfg.yFields.length === 0 && type !== 'scatter') {
    next.yFields = [];
    next.aggregation = 'count';
  }
  return next;
}

export function autoTitle(cfg: ChartConfig): string {
  const y = cfg.yFields;
  const agg = y.length ? cfg.aggregation : 'count';
  const measure = y.length > 1 ? y.slice(0, 2).join(' & ') + (y.length > 2 ? ' …' : '') : seriesLabel(y[0] ?? null, agg);
  switch (cfg.type) {
    case 'kpi':
      return agg === 'sum' && y[0] ? `Total ${y[0]}` : measure;
    case 'scatter':
      return y[0] && cfg.xField ? `${y[0]} vs ${cfg.xField}` : 'Scatter plot';
    case 'pie':
      return cfg.xField ? `${measure} share by ${cfg.xField}` : measure;
    default: {
      const by = cfg.xField ? ` by ${cfg.xField}${cfg.dateBucket !== 'none' && cfg.dateBucket !== 'day' ? ` (${cfg.dateBucket})` : ''}` : '';
      return `${measure}${by}`;
    }
  }
}

function validate(cfg: ChartConfig, ds: Dataset | undefined): string | null {
  if (!ds) return 'Pick a dataset.';
  if (cfg.type === 'scatter') {
    if (!cfg.xField || !cfg.yFields[0]) return 'Scatter plots need two numeric columns.';
    return null;
  }
  if (cfg.type !== 'kpi' && !cfg.xField) return 'Pick a label column.';
  if (cfg.includeCategories && cfg.includeCategories.length === 0) return 'Select at least one label value.';
  return null;
}

export function AddChartModal({ datasets, defaultDatasetId, initial, onSubmit, onClose }: Props) {
  const editing = !!initial;
  const [step, setStep] = useState<'type' | 'data'>(editing ? 'data' : 'type');
  const [cfg, setCfg] = useState<ChartConfig>(() => {
    if (initial) return initial;
    const ds = datasets.find((d) => d.id === defaultDatasetId) ?? datasets[0];
    return blankConfig(ds, 'bar');
  });
  const ds = datasets.find((d) => d.id === cfg.datasetId);
  const error = validate(cfg, ds);
  const finalCfg = useMemo<ChartConfig>(() => ({ ...cfg, title: cfg.title.trim() || autoTitle(cfg) }), [cfg]);

  // First pick on a new chart gets type-appropriate defaults (e.g. a date
  // column for line charts); later switches carry the user's choices across.
  const [typeChosen, setTypeChosen] = useState(editing);
  const chooseType = (type: ChartType) => {
    setCfg((c) => {
      if (!typeChosen) return { ...blankConfig(ds, type), id: c.id };
      return c.type === type ? c : retarget(c, ds, type);
    });
    setTypeChosen(true);
    setStep('data');
  };

  const footer =
    step === 'type' ? (
      <button type="button" className="btn" onClick={onClose}>
        Cancel
      </button>
    ) : (
      <>
        {error && <span className="form-error">{error}</span>}
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={!!error} onClick={() => onSubmit(finalCfg)}>
          {editing ? 'Save changes' : 'Create chart'}
        </button>
      </>
    );

  return (
    <Modal title={editing ? 'Edit chart' : step === 'type' ? 'Add chart · choose a type' : 'Add chart · select data'} onClose={onClose} footer={footer} wide={step === 'data'}>
      {step === 'type' ? (
        <div className="type-grid">
          {CHART_TYPES.map((t) => (
            <button key={t.type} type="button" className={`type-card${cfg.type === t.type && editing ? ' selected' : ''}`} onClick={() => chooseType(t.type)}>
              <ChartTypeIcon type={t.type} size={28} />
              <span className="type-name">{t.name}</span>
              <span className="type-hint">{t.hint}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="config-layout">
          <div className="config-form">
            <button type="button" className="link-btn" onClick={() => setStep('type')}>
              <IconBack size={16} />
              <ChartTypeIcon type={cfg.type} size={16} />
              {CHART_TYPES.find((t) => t.type === cfg.type)?.name} · change type
            </button>
            <DataFields cfg={cfg} setCfg={setCfg} datasets={datasets} ds={ds} />
          </div>
          <div className="config-preview">
            <div className="preview-label">Live preview</div>
            <div className="preview-card">
              <h3 className="widget-title">{finalCfg.title}</h3>
              {ds && !error ? (
                <ChartRenderer dataset={ds} config={finalCfg} height={260} />
              ) : (
                <div className="chart-empty" style={{ height: 260 }}>
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------------- form fields ---------------- */

interface FieldsProps {
  cfg: ChartConfig;
  setCfg: React.Dispatch<React.SetStateAction<ChartConfig>>;
  datasets: Dataset[];
  ds: Dataset | undefined;
}

function DataFields({ cfg, setCfg, datasets, ds }: FieldsProps) {
  const nums = numericCols(ds);
  const patch = (p: Partial<ChartConfig>) => setCfg((c) => ({ ...c, ...p }));
  const xCol = ds?.columns.find((c) => c.name === cfg.xField);
  const usesCategories = cfg.type === 'bar' || cfg.type === 'line' || cfg.type === 'area' || cfg.type === 'pie';
  const multiValue = cfg.type === 'bar' || cfg.type === 'line' || cfg.type === 'area';
  const hasValue = cfg.yFields.length > 0;

  return (
    <>
      {datasets.length > 1 && (
        <Field label="Dataset">
          <select
            value={cfg.datasetId}
            onChange={(e) => {
              const next = datasets.find((d) => d.id === e.target.value);
              setCfg((c) => ({ ...blankConfig(next, c.type), id: c.id, title: c.title, options: c.options }));
            }}
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Title" hint="Leave blank to use the suggested title">
        <input type="text" value={cfg.title} placeholder={autoTitle(cfg)} onChange={(e) => patch({ title: e.target.value })} />
      </Field>

      {usesCategories && ds && (
        <Field label={cfg.type === 'pie' ? 'Label column (slices)' : 'Label column (X axis)'}>
          <select
            value={cfg.xField ?? ''}
            onChange={(e) => {
              const col = ds.columns.find((c) => c.name === e.target.value);
              patch({ xField: e.target.value, includeCategories: null, dateBucket: col?.type === 'date' ? 'month' : 'none' });
            }}
          >
            {ds.columns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} · {c.type}
              </option>
            ))}
          </select>
        </Field>
      )}

      {usesCategories && xCol?.type === 'date' && (
        <Field label="Group dates by">
          <Segmented
            options={BUCKETS.map((b) => ({ value: b.v, label: b.label }))}
            value={cfg.dateBucket === 'none' ? 'day' : cfg.dateBucket}
            onChange={(v) => patch({ dateBucket: v as DateBucket, includeCategories: null })}
          />
        </Field>
      )}

      {cfg.type === 'scatter' && (
        <>
          <Field label="X axis (numeric)">
            <ColumnSelect cols={nums} value={cfg.xField} onChange={(v) => patch({ xField: v })} />
          </Field>
          <Field label="Y axis (numeric)">
            <ColumnSelect cols={nums} value={cfg.yFields[0] ?? null} onChange={(v) => patch({ yFields: v ? [v] : [] })} />
          </Field>
        </>
      )}

      {multiValue && (
        <Field label="Value columns" hint={`Each column becomes a series · up to ${MAX_SERIES}. None selected = count rows.`}>
          {nums.length === 0 ? (
            <p className="muted small">No numeric columns found — the chart will count rows.</p>
          ) : (
            <div className="check-list compact">
              {nums.map((c) => {
                const checked = cfg.yFields.includes(c.name);
                const full = !checked && cfg.yFields.length >= MAX_SERIES;
                return (
                  <label key={c.name} className={full ? 'disabled' : undefined}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={full}
                      onChange={() =>
                        setCfg((cur) => {
                          const yFields = checked ? cur.yFields.filter((f) => f !== c.name) : [...cur.yFields, c.name];
                          return { ...cur, yFields, aggregation: yFields.length === 0 ? 'count' : cur.aggregation === 'count' && cur.yFields.length === 0 ? 'sum' : cur.aggregation };
                        })
                      }
                    />
                    {c.name}
                  </label>
                );
              })}
            </div>
          )}
        </Field>
      )}

      {(cfg.type === 'pie' || cfg.type === 'kpi') && (
        <Field label={cfg.type === 'pie' ? 'Value column (slice size)' : 'Value column'}>
          <select
            value={cfg.yFields[0] ?? ROW_COUNT}
            onChange={(e) => {
              const v = e.target.value;
              patch(v === ROW_COUNT ? { yFields: [], aggregation: 'count' } : { yFields: [v], aggregation: cfg.yFields.length ? cfg.aggregation : 'sum' });
            }}
          >
            <option value={ROW_COUNT}>Row count</option>
            {nums.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {cfg.type !== 'scatter' && hasValue && (
        <Field label="Aggregation">
          <Segmented options={AGGS.map((a) => ({ value: a, label: AGG_LABEL[a] }))} value={cfg.aggregation} onChange={(v) => patch({ aggregation: v as Aggregation })} />
        </Field>
      )}

      {usesCategories && ds && cfg.xField && (
        <CategoryPicker ds={ds} field={cfg.xField} bucket={cfg.dateBucket} value={cfg.includeCategories} onChange={(v) => patch({ includeCategories: v })} />
      )}
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

function ColumnSelect({ cols, value, onChange }: { cols: Column[]; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {!value && <option value="">Select a column</option>}
      {cols.map((c) => (
        <option key={c.name} value={c.name}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

const PICKER_LIMIT = 300;

function CategoryPicker({ ds, field, bucket, value, onChange }: { ds: Dataset; field: string; bucket: DateBucket; value: string[] | null; onChange: (v: string[] | null) => void }) {
  const all = useMemo(() => distinctCategories(ds, field, bucket), [ds, field, bucket]);
  const [query, setQuery] = useState('');
  useEffect(() => setQuery(''), [field, bucket]);
  const selected = useMemo(() => new Set(value ?? all), [value, all]);
  const q = query.trim().toLowerCase();
  const filtered = q ? all.filter((c) => c.toLowerCase().includes(q)) : all;
  const shown = filtered.slice(0, PICKER_LIMIT);

  const toggle = (c: string) => {
    const next = new Set(selected);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    onChange(next.size === all.length ? null : all.filter((x) => next.has(x)));
  };

  return (
    <div className="field">
      <div className="field-label row">
        <span>Labels to include</span>
        <span className="muted small">
          {selected.size} of {all.length} selected
        </span>
      </div>
      <div className="picker-tools">
        {all.length > 8 && <input type="search" placeholder={`Search ${field}…`} value={query} onChange={(e) => setQuery(e.target.value)} />}
        <button type="button" className="link-btn" onClick={() => onChange(null)}>
          All
        </button>
        <button type="button" className="link-btn" onClick={() => onChange([])}>
          None
        </button>
      </div>
      <div className="check-list">
        {shown.map((c) => (
          <label key={c}>
            <input type="checkbox" checked={selected.has(c)} onChange={() => toggle(c)} />
            <span className="truncate" title={c}>
              {c}
            </span>
          </label>
        ))}
        {filtered.length === 0 && <p className="muted small">No matches.</p>}
      </div>
      {filtered.length > PICKER_LIMIT && <div className="field-hint">Showing {PICKER_LIMIT} of {filtered.length} — search to narrow.</div>}
    </div>
  );
}
