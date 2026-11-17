import { useMemo, useState, type CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ChartConfig, ChartOptions, Dataset } from '../types';
import { MAX_SLICES, columnType, distinctCategories } from '../lib/aggregate';
import { CHART_DEFS } from '../charts/registry';
import { profileDataset } from '../charts/profile';
import { defaultBinCount } from '../charts/data';
import { InfoButton } from './ChartInfo';
import { ChartRenderer } from './ChartRenderer';
import { Segmented } from './Segmented';
import { IconCopy, IconEdit, IconGrip, IconSliders, IconTable, IconTrash, IconWidth } from './icons';

interface Props {
  config: ChartConfig;
  dataset: Dataset | undefined;
  onChange: (cfg: ChartConfig) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const WIDTHS: ChartOptions['width'][] = ['third', 'half', 'full'];
const WIDTH_LABEL: Record<ChartOptions['width'], string> = { third: 'Small', half: 'Medium', full: 'Wide' };

export function ChartWidget({ config, dataset, onChange, onEdit, onDuplicate, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: config.id });
  const hasControls = controlsFor(config, dataset).length > 0;
  const [controlsOpen, setControlsOpen] = useState(hasControls);
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  const opts = config.options;
  const setOpt = (p: Partial<ChartOptions>) => onChange({ ...config, options: { ...opts, ...p } });
  const nextWidth = WIDTHS[(WIDTHS.indexOf(opts.width) + 1) % WIDTHS.length];
  const def = CHART_DEFS[config.type];
  const suggestion = useMemo(() => (dataset ? def.suggest(profileDataset(dataset)) : undefined), [dataset, def]);
  const noTable = config.type === 'kpi' || config.type === 'sparkline';

  return (
    <article ref={setNodeRef} style={style} className={`widget w-${opts.width}${isDragging ? ' dragging' : ''}`} aria-label={config.title}>
      <header className="widget-header">
        <button
          type="button"
          className="drag-handle"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${config.title}. Press space to pick up, arrow keys to move.`}
          title="Drag to reorder"
        >
          <IconGrip />
        </button>
        <h3 className="widget-title" title={config.title}>
          {config.title}
        </h3>
        <InfoButton def={def} suggestion={suggestion} datasetName={dataset?.name} />
        <div className="widget-actions">
          {hasControls && (
            <ToolButton label={controlsOpen ? 'Hide controls' : 'Show controls'} pressed={controlsOpen} onClick={() => setControlsOpen((o) => !o)}>
              <IconSliders size={16} />
            </ToolButton>
          )}
          {!noTable && (
            <ToolButton label={opts.showTable ? 'Show chart' : 'Show table'} pressed={opts.showTable} onClick={() => setOpt({ showTable: !opts.showTable })}>
              <IconTable size={16} />
            </ToolButton>
          )}
          <ToolButton label={`Size: ${WIDTH_LABEL[opts.width]} (click for ${WIDTH_LABEL[nextWidth]})`} onClick={() => setOpt({ width: nextWidth })}>
            <IconWidth size={16} />
          </ToolButton>
          <ToolButton label="Edit chart" onClick={onEdit}>
            <IconEdit size={16} />
          </ToolButton>
          <ToolButton label="Duplicate chart" onClick={onDuplicate}>
            <IconCopy size={16} />
          </ToolButton>
          <ToolButton label="Delete chart" onClick={onDelete} danger>
            <IconTrash size={16} />
          </ToolButton>
        </div>
      </header>

      {dataset && hasControls && controlsOpen && <WidgetControls config={config} dataset={dataset} setOpt={setOpt} />}

      <div className="widget-body">
        {dataset ? (
          <ChartRenderer dataset={dataset} config={config} height={opts.width === 'third' ? 220 : 280} />
        ) : (
          <div className="chart-empty" style={{ height: 200 }}>
            The dataset for this chart was removed.
          </div>
        )}
      </div>
      {dataset && <footer className="widget-footer">{dataset.name}</footer>}
    </article>
  );
}

function ToolButton({ label, onClick, children, pressed, danger }: { label: string; onClick: () => void; children: React.ReactNode; pressed?: boolean; danger?: boolean }) {
  return (
    <button type="button" className={`icon-btn${danger ? ' danger' : ''}`} onClick={onClick} aria-label={label} title={label} aria-pressed={pressed}>
      {children}
    </button>
  );
}

type ControlKey = 'topN' | 'slices' | 'bins' | 'sort' | 'funnelSort' | 'stacked' | 'horizontal' | 'labels';

/** Which sliders and toggles make sense for this chart. */
function controlsFor(config: ChartConfig, dataset: Dataset | undefined): ControlKey[] {
  if (!dataset) return [];
  const t = config.type;
  const multi = config.yFields.length > 1 || (t === 'stacked' && !!config.groupField);
  const out: ControlKey[] = [];
  if (['bar', 'column', 'stacked', 'pareto', 'dotplot', 'treemap', 'radar', 'pictograph'].includes(t)) out.push('topN');
  if (t === 'pie' || t === 'donut') out.push('slices');
  if (t === 'histogram') out.push('bins');
  if (['bar', 'column', 'stacked', 'dotplot'].includes(t)) out.push('sort');
  if (t === 'funnel') out.push('funnelSort');
  if ((t === 'bar' || t === 'column' || t === 'area') && multi) out.push('stacked');
  if (t === 'bar' || t === 'column' || t === 'stacked') out.push('horizontal');
  if (['bar', 'column', 'stacked', 'line', 'area', 'step', 'pie', 'donut', 'funnel', 'waterfall', 'heatmap', 'dotplot'].includes(t)) out.push('labels');
  return out;
}

const TOPN_LABEL: Partial<Record<ChartConfig['type'], string>> = { radar: 'Spokes', treemap: 'Rectangles', pictograph: 'Rows', pareto: 'Show top' };
const TOPN_CAP: Partial<Record<ChartConfig['type'], number>> = { radar: 12, pictograph: 10 };

function WidgetControls({ config, dataset, setOpt }: { config: ChartConfig; dataset: Dataset; setOpt: (p: Partial<ChartOptions>) => void }) {
  const opts = config.options;
  const keys = controlsFor(config, dataset);
  const categoryCount = useMemo(() => {
    if (!config.xField) return 0;
    const all = distinctCategories(dataset, config.xField, config.dateBucket);
    return config.includeCategories ? config.includeCategories.length : all.length;
  }, [dataset, config.xField, config.dateBucket, config.includeCategories]);
  const valueCount = useMemo(() => (config.yFields[0] ? dataset.rows.filter((r) => typeof r[config.yFields[0]] === 'number').length : 0), [dataset, config.yFields]);
  const xIsDate = columnType(dataset, config.xField) === 'date';
  const cap = Math.min(categoryCount, TOPN_CAP[config.type] ?? categoryCount);
  const defaultTop = TOPN_CAP[config.type] ?? 0;

  return (
    <div className="widget-controls">
      {keys.includes('topN') && cap > 2 && (
        <RangeControl
          label={TOPN_LABEL[config.type] ?? 'Show top'}
          min={config.type === 'radar' ? 3 : 1}
          max={cap}
          value={Math.min(opts.topN || defaultTop || cap, cap)}
          onChange={(v) => setOpt({ topN: v >= categoryCount ? 0 : v })}
          display={(v) => (v >= categoryCount ? `All ${categoryCount}` : String(v))}
        />
      )}
      {keys.includes('slices') && categoryCount > 1 && (
        <RangeControl
          label="Slices"
          min={1}
          max={Math.min(MAX_SLICES, categoryCount)}
          value={Math.min(opts.topN === 0 ? MAX_SLICES : opts.topN, categoryCount, MAX_SLICES)}
          onChange={(v) => setOpt({ topN: v })}
          display={(v) => (categoryCount > v ? `${v} + Other` : String(v))}
        />
      )}
      {keys.includes('bins') && (
        <RangeControl label="Bins" min={3} max={50} value={opts.bins || defaultBinCount(valueCount)} onChange={(v) => setOpt({ bins: v })} display={(v) => `~${v}`} />
      )}
      {keys.includes('sort') && (
        <Segmented
          small
          options={[
            { value: 'none', label: xIsDate ? 'Date order' : 'Data order' },
            { value: 'desc', label: 'High → low' },
            { value: 'asc', label: 'Low → high' },
          ]}
          value={opts.sort}
          onChange={(v) => setOpt({ sort: v as ChartOptions['sort'] })}
        />
      )}
      {keys.includes('funnelSort') && (
        <Segmented
          small
          options={[
            { value: 'none', label: 'Stage order' },
            { value: 'desc', label: 'Largest first' },
          ]}
          value={opts.sort === 'asc' ? 'none' : opts.sort}
          onChange={(v) => setOpt({ sort: v as ChartOptions['sort'] })}
        />
      )}
      {keys.includes('stacked') && <Toggle label="Stacked" checked={opts.stacked} onChange={(v) => setOpt({ stacked: v })} />}
      {keys.includes('horizontal') && <Toggle label="Horizontal" checked={opts.horizontal} onChange={(v) => setOpt({ horizontal: v })} />}
      {keys.includes('labels') && <Toggle label="Values" checked={opts.showLabels} onChange={(v) => setOpt({ showLabels: v })} />}
    </div>
  );
}

function RangeControl({ label, min, max, value, onChange, display }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void; display: (v: number) => string }) {
  return (
    <label className="range-control">
      <span className="control-label">{label}</span>
      <input type="range" min={min} max={max} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="range-value">{display(value)}</span>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden>
        <span className="toggle-thumb" />
      </span>
      <span className="control-label">{label}</span>
    </label>
  );
}
