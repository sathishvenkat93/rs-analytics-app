import { useEffect, useMemo, useState } from 'react';
import type { Aggregation, ChartConfig, ChartType, Dataset, DateBucket } from '../types';
import { AGG_LABEL, distinctCategories } from '../lib/aggregate';
import { CHART_DEFS, CHART_TYPES, GROUP_ORDER, type FieldSpec, type Suggestion } from '../charts/registry';
import { profileDataset } from '../charts/profile';
import { autoTitle, blankConfig, getRole, retarget, setRole, validate } from '../charts/config';
import { Modal } from './Modal';
import { ChartRenderer } from './ChartRenderer';
import { ChartTypeIcon, IconBack } from './icons';
import { Segmented } from './Segmented';
import { FitBadge, InfoButton } from './ChartInfo';

interface Props {
  datasets: Dataset[];
  defaultDatasetId: string | null;
  initial?: ChartConfig;
  onSubmit: (cfg: ChartConfig) => void;
  onClose: () => void;
}

const AGGS: Aggregation[] = ['sum', 'avg', 'count', 'min', 'max'];
const BUCKETS: { v: DateBucket; label: string }[] = [
  { v: 'day', label: 'Day' },
  { v: 'month', label: 'Month' },
  { v: 'quarter', label: 'Quarter' },
  { v: 'year', label: 'Year' },
];
const NONE = '__none__';

export function useSuggestions(ds: Dataset | undefined): Record<ChartType, Suggestion> | null {
  return useMemo(() => {
    if (!ds) return null;
    const p = profileDataset(ds);
    return Object.fromEntries(CHART_TYPES.map((d) => [d.type, d.suggest(p)])) as Record<ChartType, Suggestion>;
  }, [ds]);
}

export function AddChartModal({ datasets, defaultDatasetId, initial, onSubmit, onClose }: Props) {
  const editing = !!initial;
  const [step, setStep] = useState<'type' | 'data'>(editing ? 'data' : 'type');
  const [cfg, setCfg] = useState<ChartConfig>(() => initial ?? blankConfig(datasets.find((d) => d.id === defaultDatasetId) ?? datasets[0], 'bar'));
  const [typeChosen, setTypeChosen] = useState(editing);
  const ds = datasets.find((d) => d.id === cfg.datasetId);
  const suggestions = useSuggestions(ds);
  const error = validate(cfg, ds);
  const finalCfg = useMemo<ChartConfig>(() => ({ ...cfg, title: cfg.title.trim() || autoTitle(cfg) }), [cfg]);
  const def = CHART_DEFS[cfg.type];

  // First pick gets the type's suggested columns; later switches carry choices across.
  const chooseType = (type: ChartType) => {
    setCfg((c) => (!typeChosen ? { ...blankConfig(ds, type), id: c.id } : c.type === type ? c : retarget(c, ds, type)));
    setTypeChosen(true);
    setStep('data');
  };

  const changeDataset = (id: string) => {
    const next = datasets.find((d) => d.id === id);
    setCfg((c) => ({ ...blankConfig(next, c.type), id: c.id, title: c.title }));
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
    <Modal title={editing ? 'Edit chart' : step === 'type' ? 'Add chart · choose a type' : 'Add chart · select data'} onClose={onClose} footer={footer} wide>
      {step === 'type' ? (
        <TypePicker datasets={datasets} ds={ds} suggestions={suggestions} current={editing ? cfg.type : null} onDataset={changeDataset} onPick={chooseType} />
      ) : (
        <div className="config-layout">
          <div className="config-form">
            <div className="config-type-row">
              <button type="button" className="link-btn" onClick={() => setStep('type')}>
                <IconBack size={16} />
                <ChartTypeIcon type={cfg.type} size={16} />
                {def.name} · change type
              </button>
              <InfoButton def={def} suggestion={suggestions?.[cfg.type]} datasetName={ds?.name} />
            </div>
            {suggestions && (
              <div className={`fit-banner fit-bg-${suggestions[cfg.type].level}`}>
                <FitBadge level={suggestions[cfg.type].level} />
                <span>{suggestions[cfg.type].reason}</span>
              </div>
            )}
            {datasets.length > 1 && (
              <Field label="Dataset">
                <select value={cfg.datasetId} onChange={(e) => changeDataset(e.target.value)}>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Title" hint="Leave blank to use the suggested title">
              <input type="text" value={cfg.title} placeholder={autoTitle(cfg)} onChange={(e) => setCfg((c) => ({ ...c, title: e.target.value }))} />
            </Field>
            {ds && <DataFields cfg={cfg} setCfg={setCfg} ds={ds} />}
          </div>
          <div className="config-preview">
            <div className="preview-label">Live preview</div>
            <div className="preview-card">
              <h3 className="widget-title">{finalCfg.title}</h3>
              {ds && !error ? (
                <ChartRenderer dataset={ds} config={finalCfg} height={280} />
              ) : (
                <div className="chart-empty" style={{ height: 280 }}>
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

/* ---------------- step 1: type picker with fit suggestions ---------------- */

function TypePicker({
  datasets,
  ds,
  suggestions,
  current,
  onDataset,
  onPick,
}: {
  datasets: Dataset[];
  ds: Dataset | undefined;
  suggestions: Record<ChartType, Suggestion> | null;
  current: ChartType | null;
  onDataset: (id: string) => void;
  onPick: (t: ChartType) => void;
}) {
  const [onlyFit, setOnlyFit] = useState(false);
  const top = suggestions
    ? CHART_TYPES.filter((d) => suggestions[d.type].level === 'good')
        .sort((a, b) => suggestions[b.type].score - suggestions[a.type].score)
        .slice(0, 4)
    : [];
  const counts = suggestions ? Object.values(suggestions).reduce((acc, s) => ({ ...acc, [s.level]: (acc[s.level] ?? 0) + 1 }), {} as Record<string, number>) : {};

  return (
    <div className="picker">
      <div className="picker-head">
        <div className="picker-dataset">
          <span className="muted small">Suggestions for</span>
          {datasets.length > 1 ? (
            <select value={ds?.id} onChange={(e) => onDataset(e.target.value)} aria-label="Dataset">
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          ) : (
            <strong>{ds?.name}</strong>
          )}
          {suggestions && (
            <span className="muted small">
              · {counts.good ?? 0} good fits, {counts.possible ?? 0} possible, {counts.no ?? 0} not suitable
            </span>
          )}
        </div>
        <label className="toggle">
          <input type="checkbox" role="switch" checked={onlyFit} onChange={(e) => setOnlyFit(e.target.checked)} />
          <span className="toggle-track" aria-hidden>
            <span className="toggle-thumb" />
          </span>
          <span className="control-label">Hide charts that don’t fit</span>
        </label>
      </div>

      {top.length > 0 && suggestions && (
        <section className="suggested" aria-label="Suggested charts">
          <h3 className="picker-group">Suggested for this data</h3>
          <div className="suggested-row">
            {top.map((d) => (
              <button key={d.type} type="button" className="suggested-card" onClick={() => onPick(d.type)}>
                <span className="suggested-top">
                  <ChartTypeIcon type={d.type} size={20} />
                  <span className="type-name">{d.name}</span>
                </span>
                <span className="suggested-reason">{suggestions[d.type].reason}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {GROUP_ORDER.map((group) => {
        const defs = CHART_TYPES.filter((d) => d.group === group && (!onlyFit || !suggestions || suggestions[d.type].level !== 'no'));
        if (!defs.length) return null;
        return (
          <section key={group} aria-label={group}>
            <h3 className="picker-group">{group}</h3>
            <div className="type-grid">
              {defs.map((d) => {
                const s = suggestions?.[d.type];
                return (
                  <div key={d.type} className={`type-card card-fit-${s?.level ?? 'none'}${current === d.type ? ' selected' : ''}`}>
                    <button type="button" className="type-card-main" onClick={() => onPick(d.type)} aria-describedby={`fit-${d.type}`}>
                      <span className="type-card-top">
                        <ChartTypeIcon type={d.type} size={24} />
                        <span className="type-name">{d.name}</span>
                      </span>
                      <span className="type-hint">{d.short}</span>
                      {s && (
                        <span className="type-fit" id={`fit-${d.type}`}>
                          <FitBadge level={s.level} />
                          <span className="type-fit-reason">{s.reason}</span>
                        </span>
                      )}
                    </button>
                    <span className="type-card-info">
                      <InfoButton def={d} suggestion={s} datasetName={ds?.name} />
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ---------------- step 2: fields driven by the type's spec ---------------- */

function DataFields({ cfg, setCfg, ds }: { cfg: ChartConfig; setCfg: React.Dispatch<React.SetStateAction<ChartConfig>>; ds: Dataset }) {
  const def = CHART_DEFS[cfg.type];
  const xCol = ds.columns.find((c) => c.name === cfg.xField);
  const hasValue = cfg.yFields.length > 0;
  return (
    <>
      {def.fields.map((spec) => (
        <FieldControl key={spec.role} spec={spec} cfg={cfg} setCfg={setCfg} ds={ds} />
      ))}
      {def.bucket && xCol?.type === 'date' && (
        <Field label="Group dates by">
          <Segmented options={BUCKETS.map((b) => ({ value: b.v, label: b.label }))} value={cfg.dateBucket === 'none' ? 'day' : cfg.dateBucket} onChange={(v) => setCfg((c) => ({ ...c, dateBucket: v as DateBucket, includeCategories: null }))} />
        </Field>
      )}
      {def.aggregate && hasValue && (
        <Field label="Aggregation">
          <Segmented options={AGGS.map((a) => ({ value: a, label: AGG_LABEL[a] }))} value={cfg.aggregation} onChange={(v) => setCfg((c) => ({ ...c, aggregation: v as Aggregation }))} />
        </Field>
      )}
      {def.filter && cfg.xField && <CategoryPicker ds={ds} field={cfg.xField} bucket={cfg.dateBucket} value={cfg.includeCategories} onChange={(v) => setCfg((c) => ({ ...c, includeCategories: v }))} />}
    </>
  );
}

function FieldControl({ spec, cfg, setCfg, ds }: { spec: FieldSpec; cfg: ChartConfig; setCfg: React.Dispatch<React.SetStateAction<ChartConfig>>; ds: Dataset }) {
  const cols = ds.columns.filter((c) => spec.accepts.includes(c.type));
  const typeNote = spec.accepts.length === 1 ? spec.accepts[0] : spec.accepts.join(' / ');

  if (spec.role === 'y' && spec.multi) {
    const max = spec.max ?? 8;
    return (
      <Field label={spec.label} hint={spec.hint}>
        {cols.length === 0 ? (
          <p className="muted small">No numeric columns. The chart will count rows.</p>
        ) : (
          <div className="check-list compact">
            {cols.map((c) => {
              const checked = cfg.yFields.includes(c.name);
              const full = !checked && cfg.yFields.length >= max;
              return (
                <label key={c.name} className={full ? 'disabled' : undefined}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={full}
                    onChange={() =>
                      setCfg((cur) => {
                        const yFields = checked ? cur.yFields.filter((f) => f !== c.name) : [...cur.yFields, c.name];
                        const aggregation = yFields.length === 0 ? 'count' : cur.yFields.length === 0 ? 'sum' : cur.aggregation;
                        return { ...cur, yFields, aggregation };
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
    );
  }

  const value = getRole(cfg, spec.role);
  const emptyLabel = spec.emptyLabel ?? (spec.required ? 'Select a column' : '— None —');
  return (
    <Field label={spec.label} hint={spec.hint ?? (cols.length === 0 ? `No ${typeNote} columns in this dataset.` : undefined)}>
      <select
        value={value ?? NONE}
        onChange={(e) => {
          const v = e.target.value === NONE ? null : e.target.value;
          setCfg((c) => {
            let next = setRole(c, spec.role, v);
            if (spec.role === 'x') {
              const col = ds.columns.find((col) => col.name === v);
              next = { ...next, dateBucket: col?.type === 'date' && CHART_DEFS[c.type].bucket ? (c.type === 'candlestick' ? 'day' : 'month') : 'none' };
            }
            return next;
          });
        }}
      >
        {(!spec.required || !value) && <option value={NONE}>{emptyLabel}</option>}
        {cols.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name}
            {spec.accepts.length > 1 ? ` · ${c.type}` : ''}
          </option>
        ))}
      </select>
    </Field>
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
      {filtered.length > PICKER_LIMIT && <div className="field-hint">Showing {PICKER_LIMIT} of {filtered.length}. Search to narrow the list.</div>}
    </div>
  );
}
