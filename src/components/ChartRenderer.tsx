import { Suspense, lazy, useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  type TooltipProps,
} from 'recharts';
import type { ChartConfig, Dataset } from '../types';
import {
  CATEGORY_KEY,
  aggregateCategories,
  aggregateKpi,
  aggregatePie,
  aggregateScatter,
  type CategoryResult,
  type PieResult,
  type SeriesDef,
} from '../lib/aggregate';
import { axisFormatter, formatCompact, formatPercent, formatValue, truncate } from '../lib/format';
import { seriesColor, type ChartTheme } from '../lib/palette';
import { useTheme } from '../lib/theme';
import { DataTable } from './DataTable';
import { Empty, Legend, TooltipCard, axisProps } from './charts/common';
import { aggregateSplit } from '../charts/data';
import { CandlestickView, FunnelView, HistogramView, ParetoView, RadarView, SankeyView, SparklineView, TreemapView, WaterfallView } from './charts/MoreCharts';
import { BoxPlotView, DotPlotView, GanttView, HeatmapView, PictographView } from './charts/SvgCharts';

// Map shapes are ~250 KB, so geo charts load on first use.
const GeoView = lazy(() => import('./charts/GeoCharts').then((m) => ({ default: m.GeoView })));

interface Props {
  dataset: Dataset;
  config: ChartConfig;
  height?: number;
}

export function ChartRenderer({ dataset, config, height = 300 }: Props) {
  const { chart: theme } = useTheme();
  const p = { dataset, config, theme, height };
  switch (config.type) {
    case 'bar':
    case 'column':
    case 'stacked':
    case 'line':
    case 'area':
    case 'step':
      return <CategoryChart {...p} />;
    case 'pie':
    case 'donut':
      return <PieView {...p} />;
    case 'scatter':
    case 'bubble':
      return <ScatterView {...p} />;
    case 'kpi':
      return <KpiView dataset={dataset} config={config} />;
    case 'histogram':
      return <HistogramView {...p} />;
    case 'pareto':
      return <ParetoView {...p} />;
    case 'radar':
      return <RadarView {...p} />;
    case 'funnel':
      return <FunnelView {...p} />;
    case 'waterfall':
      return <WaterfallView {...p} />;
    case 'treemap':
      return <TreemapView {...p} />;
    case 'sankey':
      return <SankeyView {...p} />;
    case 'candlestick':
      return <CandlestickView {...p} />;
    case 'sparkline':
      return <SparklineView {...p} />;
    case 'heatmap':
      return <HeatmapView {...p} />;
    case 'boxplot':
      return <BoxPlotView {...p} />;
    case 'pictograph':
      return <PictographView {...p} />;
    case 'gantt':
      return <GanttView {...p} />;
    case 'dotplot':
      return <DotPlotView {...p} />;
    case 'geo':
    case 'scattermap':
    case 'geobubble':
      return (
        <Suspense fallback={<Empty height={height} message="Loading map…" />}>
          <GeoView {...p} />
        </Suspense>
      );
  }
}

/* ---------- bar / line / area ---------- */

function CategoryChart({ dataset, config, theme, height }: Props & { theme: ChartTheme; height: number }) {
  const split = config.type === 'stacked' && !!config.groupField;
  const result = useMemo(() => (split ? aggregateSplit(dataset, config) : aggregateCategories(dataset, config)), [dataset, config, split]);
  const { data, series, totalCategories } = result;
  if (data.length === 0) return <Empty height={height} />;

  const { stacked, horizontal, showLabels, showTable, topN } = config.options;
  const isBar = config.type === 'bar' || config.type === 'column' || config.type === 'stacked';
  const isStacked = (stacked || config.type === 'stacked') && series.length > 1;
  const maxAbs = computeMax(result, isStacked);
  const fmt = axisFormatter(maxAbs);
  const many = data.length > 8;
  const color = (s: SeriesDef) => seriesColor(theme, s.colorIndex);

  const renderTooltip = (p: TooltipProps<number, string>) => {
    if (!p.active || !p.payload?.length) return null;
    const datum = p.payload[0].payload as Record<string, number | string>;
    return (
      <TooltipCard
        title={String(datum[CATEGORY_KEY])}
        rows={series.map((s) => ({ label: s.label, value: formatValue(Number(datum[s.key] ?? 0)), color: color(s) }))}
      />
    );
  };

  const catAxisCommon = { dataKey: CATEGORY_KEY, ...axisProps(theme), tickFormatter: (v: string) => truncate(String(v), 16) };
  const valueAxisCommon = { ...axisProps(theme), axisLine: false, tickFormatter: fmt, width: 56 };
  const grid = <CartesianGrid stroke={theme.grid} vertical={horizontal} horizontal={!horizontal} />;
  const margin = { top: showLabels ? 20 : 8, right: horizontal && showLabels ? 48 : 12, bottom: 4, left: 0 };

  let chart: JSX.Element;
  if (isBar) {
    chart = (
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={margin} barGap={2} barCategoryGap="20%">
        {grid}
        {horizontal ? (
          <>
            <XAxis type="number" {...valueAxisCommon} height={28} />
            <YAxis type="category" {...catAxisCommon} width={110} interval={0} />
          </>
        ) : (
          <>
            <XAxis
              {...catAxisCommon}
              interval={many ? 'preserveStartEnd' : 0}
              angle={many ? -30 : 0}
              textAnchor={many ? 'end' : 'middle'}
              height={many ? 64 : 30}
            />
            <YAxis {...valueAxisCommon} />
          </>
        )}
        <Tooltip cursor={{ fill: theme.grid, opacity: 0.5 }} content={renderTooltip} />
        {series.map((s, i) => {
          const isTop = !isStacked || i === series.length - 1;
          const r = 4;
          const radius: [number, number, number, number] = !isTop ? [0, 0, 0, 0] : horizontal ? [0, r, r, 0] : [r, r, 0, 0];
          return (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={color(s)}
              maxBarSize={24}
              radius={radius}
              stackId={isStacked ? 'stack' : undefined}
              stroke={isStacked ? theme.surface : undefined}
              strokeWidth={isStacked ? 1 : 0}
              animationDuration={400}
            >
              {showLabels && isTop && (
                <LabelList
                  dataKey={isStacked ? (d: Record<string, number>) => series.reduce((a, x) => a + Number(d[x.key] ?? 0), 0) : s.key}
                  position={horizontal ? 'right' : 'top'}
                  formatter={(v: number) => formatCompact(v)}
                  style={{ fill: theme.textSecondary, fontSize: 11 }}
                />
              )}
            </Bar>
          );
        })}
      </BarChart>
    );
  } else {
    const showDots = data.length <= 40;
    const isLine = config.type === 'line' || config.type === 'step';
    const Chart = isLine ? LineChart : AreaChart;
    chart = (
      <Chart data={data} margin={margin}>
        {grid}
        <XAxis
          {...catAxisCommon}
          interval="preserveStartEnd"
          minTickGap={16}
          angle={many ? -30 : 0}
          textAnchor={many ? 'end' : 'middle'}
          height={many ? 64 : 30}
        />
        <YAxis {...valueAxisCommon} />
        <Tooltip cursor={{ stroke: theme.axis, strokeWidth: 1 }} content={renderTooltip} />
        {series.map((s, i) => {
          const c = color(s);
          const dot = showDots ? { r: 4, fill: c, stroke: theme.surface, strokeWidth: 2 } : false;
          const activeDot = { r: 5, fill: c, stroke: theme.surface, strokeWidth: 2 };
          const label =
            showLabels && (!isStacked || i === series.length - 1) ? (
              <LabelList
                dataKey={s.key}
                position="top"
                formatter={(v: number) => formatCompact(v)}
                style={{ fill: theme.textSecondary, fontSize: 11 }}
              />
            ) : null;
          return isLine ? (
            <Line key={s.key} type={config.type === 'step' ? 'stepAfter' : 'linear'} dataKey={s.key} name={s.label} stroke={c} strokeWidth={2} dot={dot} activeDot={activeDot} animationDuration={400}>
              {label}
            </Line>
          ) : (
            <Area
              key={s.key}
              type="linear"
              dataKey={s.key}
              name={s.label}
              stroke={c}
              strokeWidth={2}
              fill={c}
              fillOpacity={isStacked ? 0.25 : 0.1}
              stackId={isStacked ? 'stack' : undefined}
              dot={dot}
              activeDot={activeDot}
              animationDuration={400}
            >
              {label}
            </Area>
          );
        })}
      </Chart>
    );
  }

  const tableCols = [
    { key: CATEGORY_KEY, label: config.xField ?? 'Category' },
    ...series.map((s) => ({ key: s.key, label: s.label, numeric: true })),
  ];

  return (
    <div className="chart-body">
      {series.length > 1 && <Legend items={series.map((s) => ({ label: s.label, color: color(s) }))} />}
      {showTable ? (
        <DataTable columns={tableCols} rows={data} maxHeight={height} />
      ) : (
        <div style={{ height }} role="img" aria-label={`${config.type} chart of ${series.map((s) => s.label).join(', ')} by ${config.xField}`}>
          <ResponsiveContainer width="100%" height="100%">
            {chart}
          </ResponsiveContainer>
        </div>
      )}
      {topN > 0 && totalCategories > data.length && (
        <p className="chart-note">
          Showing top {data.length} of {totalCategories} categories
        </p>
      )}
    </div>
  );
}

function computeMax(result: CategoryResult, stacked: boolean): number {
  let max = 0;
  for (const d of result.data) {
    if (stacked) {
      max = Math.max(max, Math.abs(result.series.reduce((a, s) => a + Number(d[s.key] ?? 0), 0)));
    } else {
      for (const s of result.series) max = Math.max(max, Math.abs(Number(d[s.key] ?? 0)));
    }
  }
  return max;
}

/* ---------- pie / donut ---------- */

function PieView({ dataset, config, theme, height }: Props & { theme: ChartTheme; height: number }) {
  const result: PieResult = useMemo(() => aggregatePie(dataset, config), [dataset, config]);
  const { slices, total, totalCategories, valueLabel } = result;
  if (slices.length === 0) return <Empty height={height} message="No positive values to compose." />;
  const { showLabels, showTable } = config.options;
  const donut = config.type === 'donut';

  if (showTable) {
    return (
      <div className="chart-body">
        <DataTable
          columns={[
            { key: 'name', label: config.xField ?? 'Category' },
            { key: 'value', label: valueLabel, numeric: true },
            { key: 'share', label: 'Share', numeric: true },
          ]}
          rows={slices.map((s) => ({ name: s.name, value: s.value, share: formatPercent(s.value, total) }))}
          maxHeight={height}
        />
      </div>
    );
  }

  return (
    <div className="chart-body pie-layout">
      <div className="pie-canvas" style={{ height }} role="img" aria-label={`Composition of ${valueLabel} by ${config.xField}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={(p: TooltipProps<number, string>) => {
                if (!p.active || !p.payload?.length) return null;
                const s = p.payload[0].payload as { name: string; value: number; colorIndex: number };
                return (
                  <TooltipCard
                    title={s.name}
                    rows={[
                      { label: valueLabel, value: formatValue(s.value), color: seriesColor(theme, s.colorIndex) },
                      { label: 'Share', value: formatPercent(s.value, total) },
                    ]}
                  />
                );
              }}
            />
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={donut ? '58%' : 0}
              outerRadius="82%"
              stroke={theme.surface}
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive
              animationDuration={400}
              label={
                showLabels
                  ? ({ percent, x, y, textAnchor }: { percent: number; x: number; y: number; textAnchor: string }) =>
                      percent >= 0.04 ? (
                        <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="central" fill={theme.textSecondary} fontSize={11}>
                          {formatPercent(percent, 1)}
                        </text>
                      ) : null
                  : false
              }
              labelLine={false}
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={seriesColor(theme, s.colorIndex)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {donut && (
          <div className="donut-center" aria-hidden>
            <span className="donut-value">{formatCompact(total)}</span>
            <span className="donut-label">Total</span>
          </div>
        )}
      </div>
      <ul className="pie-legend" aria-label="Legend">
        {slices.map((s) => (
          <li key={s.name}>
            <span className="swatch" style={{ background: seriesColor(theme, s.colorIndex) }} aria-hidden />
            <span className="pie-legend-name" title={s.name}>
              {s.name}
            </span>
            <span className="pie-legend-value">{formatPercent(s.value, total)}</span>
          </li>
        ))}
        {slices.some((s) => s.colorIndex === -1) && (
          <li className="chart-note">“Other” combines {totalCategories - slices.length + 1} smaller categories</li>
        )}
      </ul>
    </div>
  );
}

/* ---------- scatter ---------- */

function ScatterView({ dataset, config, theme, height }: Props & { theme: ChartTheme; height: number }) {
  const { points, totalPoints } = useMemo(() => aggregateScatter(dataset, config), [dataset, config]);
  if (points.length === 0) return <Empty height={height} />;
  const xMax = Math.max(...points.map((p) => Math.abs(p.x)));
  const yMax = Math.max(...points.map((p) => Math.abs(p.y)));
  const xName = config.xField ?? 'x';
  const yName = config.yFields[0] ?? 'y';
  const zName = config.type === 'bubble' ? config.sizeField : null;
  const c = seriesColor(theme, 0);

  if (config.options.showTable) {
    return (
      <div className="chart-body">
        <DataTable
          columns={[
            { key: 'x', label: xName, numeric: true },
            { key: 'y', label: yName, numeric: true },
            ...(zName ? [{ key: 'z', label: zName, numeric: true }] : []),
          ]}
          rows={points}
          maxHeight={height}
        />
      </div>
    );
  }

  return (
    <div className="chart-body">
      <div style={{ height }} role="img" aria-label={`Scatter of ${yName} against ${xName}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
            <CartesianGrid stroke={theme.grid} />
            <XAxis
              type="number"
              dataKey="x"
              name={xName}
              {...axisProps(theme)}
              tickFormatter={axisFormatter(xMax)}
              label={{ value: xName, position: 'insideBottom', offset: -8, fill: theme.textSecondary, fontSize: 12 }}
            />
            <YAxis type="number" dataKey="y" name={yName} {...axisProps(theme)} axisLine={false} tickFormatter={axisFormatter(yMax)} width={56} />
            {zName && <ZAxis type="number" dataKey="z" range={[30, 900]} name={zName} />}
            <Tooltip
              cursor={{ stroke: theme.axis, strokeDasharray: undefined }}
              content={(p: TooltipProps<number, string>) => {
                if (!p.active || !p.payload?.length) return null;
                const d = p.payload[0].payload as { x: number; y: number; z?: number };
                return (
                  <TooltipCard
                    rows={[
                      { label: xName, value: formatValue(d.x) },
                      { label: yName, value: formatValue(d.y) },
                      ...(zName && d.z !== undefined ? [{ label: zName, value: formatValue(d.z) }] : []),
                    ]}
                  />
                );
              }}
            />
            <Scatter
              data={points}
              fill={c}
              isAnimationActive={false}
              shape={(props: { cx?: number; cy?: number; size?: number }) => (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={zName ? Math.max(3, Math.sqrt((props.size ?? 64) / Math.PI)) : 4}
                  fill={c}
                  fillOpacity={zName ? 0.45 : 0.75}
                  stroke={zName ? c : theme.surface}
                  strokeWidth={zName ? 1 : 1.5}
                />
              )}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {totalPoints > points.length && (
        <p className="chart-note">
          Showing an even sample of {points.length.toLocaleString()} of {totalPoints.toLocaleString()} points
        </p>
      )}
    </div>
  );
}

/* ---------- KPI tile ---------- */

function KpiView({ dataset, config }: { dataset: Dataset; config: ChartConfig }) {
  const { value, label, rows } = useMemo(() => aggregateKpi(dataset, config), [dataset, config]);
  return (
    <div className="kpi" role="group" aria-label={`${label}: ${formatValue(value)}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" title={formatValue(value)}>
        {formatCompact(value)}
      </div>
      <div className="kpi-sub">across {rows.toLocaleString()} rows</div>
    </div>
  );
}
