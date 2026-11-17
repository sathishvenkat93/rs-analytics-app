import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Sankey,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import type { ChartConfig, Dataset } from '../../types';
import { CATEGORY_KEY, aggregateCategories } from '../../lib/aggregate';
import { aggregateCandles, aggregateHistogram, aggregateRanked, aggregateSankey, aggregateTreemap, aggregateWaterfall, type Candle, type TreeNode, type WaterfallStep } from '../../charts/data';
import { axisFormatter, formatCompact, formatPercent, formatValue, truncate } from '../../lib/format';
import { niceTicks } from '../../lib/scale';
import { seriesColor, type ChartTheme } from '../../lib/palette';
import { useTheme } from '../../lib/theme';
import { DataTable } from '../DataTable';
import { Empty, Legend, Note, TooltipCard, axisProps } from './common';

export interface ViewProps {
  dataset: Dataset;
  config: ChartConfig;
  theme: ChartTheme;
  height: number;
}

type TipFn = (p: TooltipProps<number, string>) => JSX.Element | null;

function Frame({ height, label, children }: { height: number; label: string; children: JSX.Element }) {
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/* ---------- histogram ---------- */

export function HistogramView({ dataset, config, theme, height }: ViewProps) {
  const { bins, total, field } = useMemo(() => aggregateHistogram(dataset, config), [dataset, config]);
  if (!bins.length) return <Empty height={height} message="No numeric values to bin." />;
  if (config.options.showTable)
    return (
      <DataTable
        columns={[
          { key: 'label', label: `${field} range` },
          { key: 'count', label: 'Rows', numeric: true },
        ]}
        rows={bins}
        maxHeight={height}
      />
    );
  const maxCount = Math.max(...bins.map((b) => b.count));
  const tip: TipFn = (p) => {
    if (!p.active || !p.payload?.length) return null;
    const b = p.payload[0].payload as (typeof bins)[number];
    return <TooltipCard title={b.label} rows={[{ label: 'Rows', value: formatValue(b.count) }, { label: 'Share', value: formatPercent(b.count, total) }]} />;
  };
  return (
    <div className="chart-body">
      <Frame height={height} label={`Histogram of ${field}`}>
        <BarChart data={bins} margin={{ top: 8, right: 12, bottom: 4, left: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis dataKey="label" {...axisProps(theme)} interval="preserveStartEnd" minTickGap={12} tickFormatter={(v: string) => v.split('–')[0]} />
          <YAxis {...axisProps(theme)} axisLine={false} width={48} tickFormatter={axisFormatter(maxCount)} allowDecimals={false} />
          <Tooltip cursor={{ fill: theme.grid, opacity: 0.5 }} content={tip} />
          <Bar dataKey="count" fill={seriesColor(theme, 0)} radius={[4, 4, 0, 0]} animationDuration={400} />
        </BarChart>
      </Frame>
      <Note>
        {total.toLocaleString()} values of {field} in {bins.length} bins
      </Note>
    </div>
  );
}

/* ---------- pareto ---------- */

export function ParetoView({ dataset, config, theme, height }: ViewProps) {
  const { items, total, totalCategories, label } = useMemo(() => aggregateRanked(dataset, config, { foldOther: true }), [dataset, config]);
  if (!items.length) return <Empty height={height} message="No positive values to rank." />;
  if (config.options.showTable)
    return (
      <DataTable
        columns={[
          { key: 'name', label: config.xField ?? 'Category' },
          { key: 'value', label, numeric: true },
          { key: 'sharePct', label: 'Share', numeric: true },
          { key: 'cumPct', label: 'Cumulative', numeric: true },
        ]}
        rows={items.map((i) => ({ ...i, sharePct: pct(i.share), cumPct: pct(i.cumShare) }))}
        maxHeight={height}
      />
    );
  const vital = items.findIndex((i) => i.cumShare >= 0.8) + 1;
  const tip: TipFn = (p) => {
    if (!p.active || !p.payload?.length) return null;
    const d = p.payload[0].payload as (typeof items)[number];
    return (
      <TooltipCard
        title={d.name}
        rows={[
          { label, value: formatValue(d.value) },
          { label: 'Share of total', value: pct(d.share), color: seriesColor(theme, 0) },
          { label: 'Cumulative share', value: pct(d.cumShare), color: seriesColor(theme, 1) },
        ]}
      />
    );
  };
  const many = items.length > 8;
  return (
    <div className="chart-body">
      <Legend
        items={[
          { label: 'Share of total', color: seriesColor(theme, 0) },
          { label: 'Cumulative share', color: seriesColor(theme, 1), shape: 'line' },
        ]}
      />
      <Frame height={height} label={`Pareto chart of ${label} by ${config.xField}`}>
        <ComposedChart data={items} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis dataKey="name" {...axisProps(theme)} interval={many ? 'preserveStartEnd' : 0} angle={many ? -30 : 0} textAnchor={many ? 'end' : 'middle'} height={many ? 64 : 30} tickFormatter={(v: string) => truncate(v, 14)} />
          <YAxis {...axisProps(theme)} axisLine={false} width={44} domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tickFormatter={pct} />
          <ReferenceLine y={0.8} stroke={theme.axis} label={{ value: '80%', position: 'insideTopRight', fill: theme.muted, fontSize: 11 }} />
          <Tooltip cursor={{ fill: theme.grid, opacity: 0.5 }} content={tip} />
          <Bar dataKey="share" fill={seriesColor(theme, 0)} maxBarSize={24} radius={[4, 4, 0, 0]} animationDuration={400} />
          <Line dataKey="cumShare" stroke={seriesColor(theme, 1)} strokeWidth={2} dot={{ r: 4, fill: seriesColor(theme, 1), stroke: theme.surface, strokeWidth: 2 }} animationDuration={400} />
        </ComposedChart>
      </Frame>
      <Note>
        {vital > 0 && `${vital} of ${totalCategories} categories make up 80% of the total (${formatCompact(total)}).`}
      </Note>
    </div>
  );
}

/* ---------- radar ---------- */

export function RadarView({ dataset, config, theme, height }: ViewProps) {
  const cfg = useMemo(() => ({ ...config, options: { ...config.options, topN: Math.min(config.options.topN || 12, 12) } }), [config]);
  const { data, series, totalCategories } = useMemo(() => aggregateCategories(dataset, cfg), [dataset, cfg]);
  if (data.length < 3) return <Empty height={height} message="A radar chart needs at least 3 categories." />;
  if (config.options.showTable)
    return <DataTable columns={[{ key: CATEGORY_KEY, label: config.xField ?? 'Category' }, ...series.map((s) => ({ key: s.key, label: s.label, numeric: true }))]} rows={data} maxHeight={height} />;
  const max = Math.max(...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const tip: TipFn = (p) => {
    if (!p.active || !p.payload?.length) return null;
    const d = p.payload[0].payload as Record<string, number | string>;
    return <TooltipCard title={String(d[CATEGORY_KEY])} rows={series.map((s) => ({ label: s.label, value: formatValue(Number(d[s.key])), color: seriesColor(theme, s.colorIndex) }))} />;
  };
  return (
    <div className="chart-body">
      {series.length > 1 && <Legend items={series.map((s) => ({ label: s.label, color: seriesColor(theme, s.colorIndex) }))} />}
      <Frame height={height} label={`Radar chart of ${series.map((s) => s.label).join(', ')} across ${config.xField}`}>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke={theme.grid} />
          <PolarAngleAxis dataKey={CATEGORY_KEY} tick={{ fill: theme.textSecondary, fontSize: 11 }} tickFormatter={(v: string) => truncate(String(v), 14)} />
          <PolarRadiusAxis angle={90} tick={{ fill: theme.muted, fontSize: 10 }} axisLine={false} tickFormatter={axisFormatter(max)} />
          <Tooltip content={tip} />
          {series.map((s) => (
            <Radar key={s.key} dataKey={s.key} name={s.label} stroke={seriesColor(theme, s.colorIndex)} strokeWidth={2} fill={seriesColor(theme, s.colorIndex)} fillOpacity={0.12} dot={{ r: 3, fill: seriesColor(theme, s.colorIndex) }} animationDuration={400} />
          ))}
        </RadarChart>
      </Frame>
      {totalCategories > data.length && <Note>Showing the top {data.length} of {totalCategories} spokes</Note>}
    </div>
  );
}

/* ---------- funnel ---------- */

export function FunnelView({ dataset, config, theme, height }: ViewProps) {
  const { data, series } = useMemo(() => aggregateCategories(dataset, { ...config, options: { ...config.options, topN: 0 } }), [dataset, config]);
  const s0 = series[0];
  const stages = data.map((d) => ({ name: String(d[CATEGORY_KEY]), value: Number(d[s0.key]) || 0 }));
  if (config.options.sort === 'desc') stages.sort((a, b) => b.value - a.value);
  if (config.options.sort === 'asc') stages.sort((a, b) => a.value - b.value);
  if (stages.length === 0) return <Empty height={height} />;
  const first = stages[0].value || 1;
  const max = Math.max(...stages.map((s) => s.value)) || 1;
  let biggest = { from: '', to: '', drop: 0 };
  stages.forEach((s, i) => {
    if (i === 0) return;
    const prev = stages[i - 1].value;
    const drop = prev ? (prev - s.value) / prev : 0;
    if (drop > biggest.drop) biggest = { from: stages[i - 1].name, to: s.name, drop };
  });
  if (config.options.showTable)
    return (
      <DataTable
        columns={[
          { key: 'name', label: 'Stage' },
          { key: 'value', label: s0.label, numeric: true },
          { key: 'ofFirst', label: '% of first', numeric: true },
        ]}
        rows={stages.map((s) => ({ ...s, ofFirst: formatPercent(s.value, first) }))}
        maxHeight={height}
      />
    );
  return (
    <div className="chart-body">
      <ol className="funnel" style={{ minHeight: Math.min(height, stages.length * 44) }} aria-label={`Funnel of ${s0.label}`}>
        {stages.map((s, i) => {
          const prev = i > 0 ? stages[i - 1].value : null;
          return (
            <li key={s.name} className="funnel-row">
              <span className="funnel-label" title={s.name}>
                {s.name}
              </span>
              <span className="funnel-track">
                <span className="funnel-bar" style={{ width: `${Math.max(1.5, (s.value / max) * 100)}%`, background: seriesColor(theme, 0) }} title={`${s.name}: ${formatValue(s.value)}`} />
              </span>
              <span className="funnel-value">
                <strong>{formatCompact(s.value)}</strong>
                {config.options.showLabels && (
                  <span className="muted">
                    {' '}
                    {formatPercent(s.value, first)}
                    {prev !== null && prev > 0 && ` · ${s.value <= prev ? '−' : '+'}${formatPercent(Math.abs(prev - s.value), prev)}`}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {biggest.drop > 0 && (
        <Note>
          Biggest drop: {biggest.from} → {biggest.to} (−{Math.round(biggest.drop * 100)}%)
        </Note>
      )}
    </div>
  );
}

/* ---------- waterfall ---------- */

export function WaterfallView({ dataset, config, theme, height }: ViewProps) {
  const { steps, label } = useMemo(() => aggregateWaterfall(dataset, config), [dataset, config]);
  if (!steps.length) return <Empty height={height} />;
  const up = seriesColor(theme, 0);
  const down = seriesColor(theme, 7);
  const tot = theme.textSecondary;
  const colorOf = (s: WaterfallStep) => (s.kind === 'total' ? tot : s.kind === 'up' ? up : down);
  if (config.options.showTable)
    return (
      <DataTable
        columns={[
          { key: 'name', label: config.xField ?? 'Step' },
          { key: 'delta', label: 'Change', numeric: true },
          { key: 'running', label: 'Running total', numeric: true },
        ]}
        rows={steps}
        maxHeight={height}
      />
    );
  const lo = Math.min(0, ...steps.map((s) => s.range[0]));
  const hi = Math.max(...steps.map((s) => s.range[1]));
  const ticks = niceTicks(lo, hi, 5);
  const many = steps.length > 10;
  const tip: TipFn = (p) => {
    if (!p.active || !p.payload?.length) return null;
    const s = p.payload[0].payload as WaterfallStep;
    return (
      <TooltipCard
        title={s.name}
        rows={s.kind === 'total' ? [{ label: `Total ${label}`, value: formatValue(s.running), color: tot }] : [{ label: 'Change', value: `${s.delta >= 0 ? '+' : ''}${formatValue(s.delta)}`, color: colorOf(s) }, { label: 'Running total', value: formatValue(s.running) }]}
      />
    );
  };
  return (
    <div className="chart-body">
      <Legend
        items={[
          { label: 'Increase', color: up },
          { label: 'Decrease', color: down },
          { label: 'Total', color: tot },
        ]}
      />
      <Frame height={height} label={`Waterfall of ${label}`}>
        <BarChart data={steps} margin={{ top: config.options.showLabels ? 20 : 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis dataKey="name" {...axisProps(theme)} interval={many ? 'preserveStartEnd' : 0} angle={many ? -30 : 0} textAnchor={many ? 'end' : 'middle'} height={many ? 64 : 30} tickFormatter={(v: string) => truncate(v, 12)} />
          <YAxis {...axisProps(theme)} axisLine={false} width={56} domain={[ticks[0], ticks[ticks.length - 1]]} ticks={ticks} tickFormatter={axisFormatter(Math.max(Math.abs(lo), hi))} />
          <ReferenceLine y={0} stroke={theme.axis} />
          <Tooltip cursor={{ fill: theme.grid, opacity: 0.5 }} content={tip} />
          <Bar dataKey="range" maxBarSize={32} radius={3} animationDuration={400}>
            {steps.map((s) => (
              <Cell key={s.name} fill={colorOf(s)} />
            ))}
            {config.options.showLabels && <LabelList dataKey="delta" position="top" formatter={(v: number) => formatCompact(v)} style={{ fill: theme.textSecondary, fontSize: 11 }} />}
          </Bar>
        </BarChart>
      </Frame>
    </div>
  );
}

/* ---------- treemap ---------- */

interface TreeCellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  depth?: number;
  name?: string;
  value?: number;
  colorIndex?: number;
  children?: unknown[];
}

export function TreemapView({ dataset, config, theme, height }: ViewProps) {
  const { nodes, total, label, totalCategories } = useMemo(() => aggregateTreemap(dataset, config), [dataset, config]);
  const { mode } = useTheme();
  if (!nodes.length) return <Empty height={height} message="No positive values to size rectangles." />;
  if (config.options.showTable) {
    const rows = nodes.flatMap((n) => (n.children?.length ? n.children.map((c) => ({ parent: n.name, name: c.name, value: c.value })) : [{ parent: n.name, name: '', value: n.value }]));
    return (
      <DataTable
        columns={[
          { key: 'parent', label: config.xField ?? 'Category' },
          ...(config.groupField ? [{ key: 'name', label: config.groupField }] : []),
          { key: 'value', label, numeric: true },
        ]}
        rows={rows}
        maxHeight={height}
      />
    );
  }
  const nested = nodes.some((n) => n.children?.length);
  const content = (p: TreeCellProps) => {
    const { x = 0, y = 0, width = 0, height: h = 0, depth = 0, name = '', value = 0, colorIndex = 0 } = p;
    const isLeaf = nested ? depth === 2 : depth === 1;
    if (!isLeaf) return <g />;
    const fill = seriesColor(theme, colorIndex);
    const ink = colorIndex === 3 && mode === 'light' ? '#0b0b0b' : '#ffffff';
    const fits = width > Math.min(110, name.length * 7 + 12) && h > 34;
    return (
      <g>
        <rect x={x} y={y} width={width} height={h} rx={3} fill={fill} stroke={theme.surface} strokeWidth={2} />
        {fits && (
          <>
            <text x={x + 6} y={y + 16} fill={ink} fontSize={12} fontWeight={600}>
              {truncate(name, Math.floor((width - 12) / 7))}
            </text>
            <text x={x + 6} y={y + 30} fill={ink} fontSize={11} opacity={0.85}>
              {formatCompact(value)} · {formatPercent(value, total)}
            </text>
          </>
        )}
      </g>
    );
  };
  const tip: TipFn = (p) => {
    if (!p.active || !p.payload?.length) return null;
    const d = p.payload[0].payload as TreeNode;
    return <TooltipCard title={d.parent ? `${d.parent} › ${d.name}` : d.name} rows={[{ label, value: formatValue(d.value), color: seriesColor(theme, d.colorIndex) }, { label: 'Share', value: formatPercent(d.value, total) }]} />;
  };
  const legendItems = nodes.filter((n) => n.colorIndex >= 0).map((n) => ({ label: n.name, color: seriesColor(theme, n.colorIndex) }));
  return (
    <div className="chart-body">
      {nested && <Legend items={legendItems} />}
      <Frame height={height} label={`Treemap of ${label}`}>
        <Treemap data={nodes} dataKey="value" nameKey="name" isAnimationActive={false} content={content as never} aspectRatio={4 / 3}>
          <Tooltip content={tip} />
        </Treemap>
      </Frame>
      {totalCategories > nodes.length && <Note>Showing the top {nodes.length} of {totalCategories} categories</Note>}
      {nodes.some((n) => n.colorIndex < 0) && <Note>Categories beyond the first 8 are shown in grey.</Note>}
    </div>
  );
}

/* ---------- sankey ---------- */

export function SankeyView({ dataset, config, theme, height }: ViewProps) {
  const data = useMemo(() => aggregateSankey(dataset, config), [dataset, config]);
  if (!data.links.length) return <Empty height={height} message="No flows between the two columns." />;
  if (config.options.showTable)
    return (
      <DataTable
        columns={[
          { key: 'from', label: config.xField ?? 'Source' },
          { key: 'to', label: config.groupField ?? 'Target' },
          { key: 'value', label: data.label, numeric: true },
        ]}
        rows={data.links.map((l) => ({ from: data.nodes[l.source].name, to: data.nodes[l.target].name, value: l.value }))}
        maxHeight={height}
      />
    );
  const nodeColor = (i: number) => {
    const n = data.nodes[i];
    return n.side === 'source' ? seriesColor(theme, n.colorIndex) : theme.textSecondary;
  };
  // Each source must keep its colour even when recharts re-orders nodes, so look nodes up by name+side.
  const indexOf = new Map(data.nodes.map((n, i) => [`${n.side}:${n.name}`, i]));
  type SNode = { x: number; y: number; width: number; height: number; payload: { name: string; side: 'source' | 'target'; value: number } };
  const Node = (p: SNode) => {
    const i = indexOf.get(`${p.payload.side}:${p.payload.name}`) ?? 0;
    const isSource = p.payload.side === 'source';
    return (
      <g>
        <rect x={p.x} y={p.y} width={p.width} height={Math.max(1, p.height)} rx={2} fill={nodeColor(i)} />
        <text x={isSource ? p.x - 6 : p.x + p.width + 6} y={p.y + p.height / 2} textAnchor={isSource ? 'end' : 'start'} dominantBaseline="central" fill={theme.textSecondary} fontSize={12}>
          {truncate(p.payload.name, 18)} <tspan fill={theme.muted}>{formatCompact(p.payload.value)}</tspan>
        </text>
      </g>
    );
  };
  type SLink = { sourceX: number; targetX: number; sourceY: number; targetY: number; sourceControlX: number; targetControlX: number; linkWidth: number; payload: { source: { name: string; side: 'source' | 'target' } } };
  const Link = (p: SLink) => {
    const i = indexOf.get(`source:${p.payload.source.name}`) ?? 0;
    return (
      <path
        d={`M${p.sourceX},${p.sourceY} C${p.sourceControlX},${p.sourceY} ${p.targetControlX},${p.targetY} ${p.targetX},${p.targetY}`}
        fill="none"
        stroke={nodeColor(i)}
        strokeOpacity={0.28}
        strokeWidth={Math.max(1, p.linkWidth)}
      />
    );
  };
  const tip: TipFn = (p) => {
    if (!p.active || !p.payload?.length) return null;
    const d = p.payload[0].payload as { payload?: { source?: { name: string }; target?: { name: string }; value: number; name?: string } };
    const inner = d.payload;
    if (!inner) return null;
    return inner.source && inner.target ? (
      <TooltipCard title={`${inner.source.name} → ${inner.target.name}`} rows={[{ label: data.label, value: formatValue(inner.value) }]} />
    ) : (
      <TooltipCard title={inner.name} rows={[{ label: data.label, value: formatValue(inner.value) }]} />
    );
  };
  return (
    <div className="chart-body">
      <Frame height={height} label={`Sankey diagram from ${config.xField} to ${config.groupField}`}>
        <Sankey data={data} node={Node as never} link={Link as never} nodePadding={14} nodeWidth={10} margin={{ top: 8, right: 150, bottom: 8, left: 150 }} iterations={48}>
          <Tooltip content={tip} />
        </Sankey>
      </Frame>
    </div>
  );
}

/* ---------- candlestick ---------- */

export function CandlestickView({ dataset, config, theme, height }: ViewProps) {
  const candles = useMemo(() => aggregateCandles(dataset, config), [dataset, config]);
  if (!candles.length) return <Empty height={height} message="Choose date, open, high, low and close columns." />;
  if (config.options.showTable)
    return (
      <DataTable
        columns={[
          { key: 'name', label: 'Period' },
          { key: 'open', label: 'Open', numeric: true },
          { key: 'high', label: 'High', numeric: true },
          { key: 'low', label: 'Low', numeric: true },
          { key: 'close', label: 'Close', numeric: true },
        ]}
        rows={candles}
        maxHeight={height}
      />
    );
  const upC = seriesColor(theme, 5);
  const downC = seriesColor(theme, 7);
  const ticks = niceTicks(Math.min(...candles.map((c) => c.low)), Math.max(...candles.map((c) => c.high)), 5);
  type ShapeProps = { x: number; y: number; width: number; height: number; payload: Candle };
  const shape = (p: ShapeProps) => {
    const { x, y, width, height: h, payload: c } = p;
    const span = c.high - c.low || 1;
    const yOf = (v: number) => y + ((c.high - v) / span) * h;
    const up = c.close >= c.open;
    const top = yOf(Math.max(c.open, c.close));
    const bottom = yOf(Math.min(c.open, c.close));
    const cx = x + width / 2;
    const color = up ? upC : downC;
    const bw = Math.max(3, Math.min(width, 14));
    return (
      <g>
        <line x1={cx} x2={cx} y1={y} y2={y + h} stroke={color} strokeWidth={1.5} />
        <rect x={cx - bw / 2} y={top} width={bw} height={Math.max(1.5, bottom - top)} rx={1.5} fill={up ? theme.surface : color} stroke={color} strokeWidth={1.5} />
      </g>
    );
  };
  const tip: TipFn = (p) => {
    if (!p.active || !p.payload?.length) return null;
    const c = p.payload[0].payload as Candle;
    const up = c.close >= c.open;
    return (
      <TooltipCard
        title={`${c.name} · ${up ? 'Up' : 'Down'} ${formatPercent(Math.abs(c.close - c.open), c.open)}`}
        rows={[
          { label: 'Open', value: formatValue(c.open) },
          { label: 'High', value: formatValue(c.high) },
          { label: 'Low', value: formatValue(c.low) },
          { label: 'Close', value: formatValue(c.close), color: up ? upC : downC },
        ]}
      />
    );
  };
  return (
    <div className="chart-body">
      <Legend
        items={[
          { label: 'Up (close ≥ open)', color: upC, shape: 'hollow' },
          { label: 'Down', color: downC },
        ]}
      />
      <Frame height={height} label={`Candlestick chart of ${config.extra.close}`}>
        <BarChart data={candles} margin={{ top: 8, right: 12, bottom: 4, left: 0 }} barCategoryGap="25%">
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis dataKey="name" {...axisProps(theme)} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axisProps(theme)} axisLine={false} width={56} domain={[ticks[0], ticks[ticks.length - 1]]} ticks={ticks} tickFormatter={axisFormatter(ticks[ticks.length - 1])} />
          <Tooltip cursor={{ fill: theme.grid, opacity: 0.5 }} content={tip} />
          <Bar dataKey="range" shape={shape as never} isAnimationActive={false} />
        </BarChart>
      </Frame>
    </div>
  );
}

/* ---------- sparkline ---------- */

export function SparklineView({ dataset, config, theme, height }: ViewProps) {
  const { mode } = useTheme();
  const { data, series } = useMemo(() => aggregateCategories(dataset, { ...config, options: { ...config.options, topN: 0, sort: 'none' } }), [dataset, config]);
  const s0 = series[0];
  if (data.length < 2) return <Empty height={Math.min(height, 120)} message="Needs at least two periods." />;
  const last = Number(data[data.length - 1][s0.key]);
  const prev = Number(data[data.length - 2][s0.key]);
  const change = prev ? (last - prev) / Math.abs(prev) : 0;
  const up = change >= 0;
  const deltaColor = up ? (mode === 'dark' ? '#0ca30c' : '#006300') : mode === 'dark' ? '#e66767' : '#d03b3b';
  const c = seriesColor(theme, 0);
  const tip: TipFn = (p) => {
    if (!p.active || !p.payload?.length) return null;
    const d = p.payload[0].payload as Record<string, number | string>;
    return <TooltipCard title={String(d[CATEGORY_KEY])} rows={[{ label: s0.label, value: formatValue(Number(d[s0.key])) }]} />;
  };
  return (
    <div className="sparkline">
      <div className="kpi-label">{s0.label}</div>
      <div className="sparkline-row">
        <span className="kpi-value">{formatCompact(last)}</span>
        <span className="sparkline-delta" style={{ color: deltaColor }}>
          {up ? '▲' : '▼'} {formatPercent(Math.abs(change), 1)}
        </span>
      </div>
      <div style={{ height: 64 }} role="img" aria-label={`Trend of ${s0.label}: latest ${formatValue(last)}, ${up ? 'up' : 'down'} ${formatPercent(Math.abs(change), 1)} on the previous period`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 6, bottom: 6, left: 6 }}>
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Tooltip cursor={{ stroke: theme.axis }} content={tip} />
            <Line
              dataKey={s0.key}
              stroke={c}
              strokeWidth={2}
              isAnimationActive={false}
              dot={(p: { cx?: number; cy?: number; index?: number }) =>
                p.index === data.length - 1 ? <circle key="end" cx={p.cx} cy={p.cy} r={4} fill={c} stroke={theme.surface} strokeWidth={2} /> : <g key={p.index} />
              }
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="kpi-sub">
        {String(data[0][CATEGORY_KEY])} → {String(data[data.length - 1][CATEGORY_KEY])} · vs previous period
      </div>
    </div>
  );
}
