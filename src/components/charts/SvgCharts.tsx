import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_KEY, aggregateCategories } from '../../lib/aggregate';
import { aggregateBoxes, aggregateGantt, aggregateHeatmap, aggregateRanked, heatKey } from '../../charts/data';
import { axisFormatter, formatCompact, formatValue, truncate } from '../../lib/format';
import { linear, niceTicks } from '../../lib/scale';
import { seriesColor } from '../../lib/palette';
import { useTheme } from '../../lib/theme';
import { DataTable } from '../DataTable';
import { Empty, Legend, Note, TooltipCard, useHoverTip } from './common';
import type { ViewProps } from './MoreCharts';

/** Width of a container, tracked with ResizeObserver. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Sequential blue ramp: light steps recede toward each mode's surface. */
const RAMP_LIGHT = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
const RAMP_DARK = ['#16263b', '#104281', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4'];
export function useRamp() {
  const { mode } = useTheme();
  const ramp = mode === 'dark' ? RAMP_DARK : RAMP_LIGHT;
  // Text inside a cell: near-black on light steps, white on dark ones.
  const inkFor = (i: number) => (mode === 'dark' ? (i >= 5 ? '#0b0b0b' : '#ffffff') : i >= 3 ? '#ffffff' : '#0b0b0b');
  return { ramp, inkFor };
}

/* ---------- heatmap ---------- */

export function HeatmapView({ dataset, config, height }: ViewProps) {
  const h = useMemo(() => aggregateHeatmap(dataset, config), [dataset, config]);
  const { ramp, inkFor } = useRamp();
  const { node: tipNode, bind } = useHoverTip();
  if (!h.rows.length || !h.cols.length) return <Empty height={height} />;
  if (config.options.showTable)
    return (
      <DataTable
        columns={[{ key: 'r', label: config.groupField ?? 'Row' }, ...h.cols.map((c) => ({ key: c, label: c, numeric: true }))]}
        rows={h.rows.map((r) => Object.fromEntries([['r', r], ...h.cols.map((c) => [c, h.cells.get(heatKey(r, c)) ?? null])]))}
        maxHeight={height}
      />
    );
  const step = (v: number) => (h.max === h.min ? ramp.length - 1 : Math.min(ramp.length - 1, Math.floor(((v - h.min) / (h.max - h.min)) * ramp.length)));
  const vertical = h.cols.length > 8;
  return (
    <div className="chart-body">
      <div className="heatmap-scroll" style={{ maxHeight: height + 60 }}>
        <div className="heatmap" style={{ gridTemplateColumns: `minmax(80px, 140px) repeat(${h.cols.length}, minmax(${config.options.showLabels ? 44 : 18}px, 1fr))` }} role="table" aria-label={`Heatmap of ${h.label}`}>
          <div role="columnheader" />
          {h.cols.map((c) => (
            <div key={c} className={`heat-col${vertical ? ' vertical' : ''}`} role="columnheader" title={c}>
              {truncate(c, vertical ? 10 : 12)}
            </div>
          ))}
          {h.rows.map((r) => (
            <div key={r} className="heat-rowgroup" role="row" style={{ display: 'contents' }}>
              <div className="heat-row" role="rowheader" title={r}>
                {r}
              </div>
              {h.cols.map((c) => {
                const v = h.cells.get(heatKey(r, c));
                if (v === undefined) return <div key={c} className="heat-cell empty" role="cell" aria-label={`${r}, ${c}: no data`} />;
                const i = step(v);
                return (
                  <div key={c} className="heat-cell" role="cell" style={{ background: ramp[i], color: inkFor(i) }} aria-label={`${r}, ${c}: ${formatValue(v)}`} {...bind(<TooltipCard title={`${r} · ${c}`} rows={[{ label: h.label, value: formatValue(v) }]} />)}>
                    {config.options.showLabels ? formatCompact(v) : ''}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="ramp-legend" aria-label="Colour scale">
        <span>{formatCompact(h.min)}</span>
        <span className="ramp-bar">
          {ramp.map((c) => (
            <span key={c} style={{ background: c }} />
          ))}
        </span>
        <span>{formatCompact(h.max)}</span>
        <span className="muted">{h.label}</span>
      </div>
      {h.truncated && <Note>Large grid trimmed to the top 30 rows × first 40 columns.</Note>}
      {tipNode}
    </div>
  );
}

/* ---------- box plot ---------- */

export function BoxPlotView({ dataset, config, theme, height }: ViewProps) {
  const { boxes, totalGroups } = useMemo(() => aggregateBoxes(dataset, config), [dataset, config]);
  const [ref, width] = useWidth<HTMLDivElement>();
  const { node: tipNode, bind } = useHoverTip();
  if (!boxes.length) return <Empty height={height} message="No numeric values." />;
  const field = config.yFields[0];
  if (config.options.showTable)
    return (
      <DataTable
        columns={[
          { key: 'name', label: config.xField ?? 'Group' },
          { key: 'n', label: 'Count', numeric: true },
          { key: 'lo', label: 'Min (whisker)', numeric: true },
          { key: 'q1', label: 'Q1', numeric: true },
          { key: 'median', label: 'Median', numeric: true },
          { key: 'q3', label: 'Q3', numeric: true },
          { key: 'hi', label: 'Max (whisker)', numeric: true },
          { key: 'outliers', label: 'Outliers', numeric: true },
        ]}
        rows={boxes.map((b) => ({ ...b, outliers: b.outliers.length }))}
        maxHeight={height}
      />
    );
  const all = boxes.flatMap((b) => [b.lo, b.hi, ...b.outliers]);
  const ticks = niceTicks(Math.min(...all), Math.max(...all), 5);
  const m = { top: 10, right: 12, bottom: 34, left: 56 };
  const w = Math.max(width, 200);
  const y = linear([ticks[0], ticks[ticks.length - 1]], [height - m.bottom, m.top]);
  const band = (w - m.left - m.right) / boxes.length;
  const bw = Math.min(48, band * 0.5);
  const fmt = axisFormatter(Math.max(...all.map(Math.abs)));
  const c = seriesColor(theme, 0);
  return (
    <div className="chart-body" ref={ref}>
      {width > 0 && (
        <svg width={w} height={height} role="img" aria-label={`Box plot of ${field}${config.xField ? ` by ${config.xField}` : ''}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={w - m.right} y1={y(t)} y2={y(t)} stroke={theme.grid} />
              <text x={m.left - 8} y={y(t)} textAnchor="end" dominantBaseline="central" fill={theme.muted} fontSize={12}>
                {fmt(t)}
              </text>
            </g>
          ))}
          {boxes.map((b, i) => {
            const cx = m.left + band * i + band / 2;
            return (
              <g key={b.name}>
                <line x1={cx} x2={cx} y1={y(b.hi)} y2={y(b.q3)} stroke={c} strokeWidth={1.5} />
                <line x1={cx} x2={cx} y1={y(b.q1)} y2={y(b.lo)} stroke={c} strokeWidth={1.5} />
                <line x1={cx - bw / 4} x2={cx + bw / 4} y1={y(b.hi)} y2={y(b.hi)} stroke={c} strokeWidth={1.5} />
                <line x1={cx - bw / 4} x2={cx + bw / 4} y1={y(b.lo)} y2={y(b.lo)} stroke={c} strokeWidth={1.5} />
                <rect x={cx - bw / 2} y={y(b.q3)} width={bw} height={Math.max(1, y(b.q1) - y(b.q3))} rx={4} fill={c} fillOpacity={0.16} stroke={c} strokeWidth={1.5} />
                <line x1={cx - bw / 2} x2={cx + bw / 2} y1={y(b.median)} y2={y(b.median)} stroke={theme.textPrimary} strokeWidth={2} />
                {b.outliers.slice(0, 200).map((o, j) => (
                  <circle key={j} cx={cx} cy={y(o)} r={3.5} fill={theme.surface} stroke={c} strokeWidth={1.5} />
                ))}
                <rect
                  x={cx - band / 2}
                  y={m.top}
                  width={band}
                  height={height - m.top - m.bottom}
                  fill="transparent"
                  {...bind(
                    <TooltipCard
                      title={`${b.name} · ${b.n.toLocaleString()} values`}
                      rows={[
                        { label: 'Max (whisker)', value: formatValue(b.hi) },
                        { label: 'Q3', value: formatValue(b.q3) },
                        { label: 'Median', value: formatValue(b.median) },
                        { label: 'Q1', value: formatValue(b.q1) },
                        { label: 'Min (whisker)', value: formatValue(b.lo) },
                        { label: 'Mean', value: formatValue(b.mean) },
                        { label: 'Outliers', value: String(b.outliers.length) },
                      ]}
                    />,
                  )}
                />
                <text x={cx} y={height - m.bottom + 18} textAnchor="middle" fill={theme.muted} fontSize={12}>
                  {truncate(b.name === 'All' ? field : b.name, Math.max(4, Math.floor(band / 7)))}
                </text>
              </g>
            );
          })}
          <line x1={m.left} x2={w - m.right} y1={height - m.bottom} y2={height - m.bottom} stroke={theme.axis} />
        </svg>
      )}
      {totalGroups > boxes.length && <Note>Showing the 15 largest of {totalGroups} groups</Note>}
      {tipNode}
    </div>
  );
}

/* ---------- pictograph ---------- */

function niceUnit(max: number, target = 10): number {
  const raw = max / target;
  if (raw <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

export function PictographView({ dataset, config, theme, height }: ViewProps) {
  const { items, totalCategories, label } = useMemo(() => aggregateRanked(dataset, config, { foldOther: false, limit: Math.min(config.options.topN || 6, 10) }), [dataset, config]);
  if (!items.length) return <Empty height={height} message="No positive values." />;
  if (config.options.showTable)
    return (
      <DataTable
        columns={[
          { key: 'name', label: config.xField ?? 'Category' },
          { key: 'value', label, numeric: true },
        ]}
        rows={items}
        maxHeight={height}
      />
    );
  const unit = niceUnit(items[0].value);
  const c = seriesColor(theme, 0);
  const Icon = ({ fill }: { fill: number }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <defs>
        <clipPath id={`clip-${Math.round(fill * 100)}`}>
          <rect x="0" y="0" width={18 * fill} height="18" />
        </clipPath>
      </defs>
      <g fill="none" stroke={theme.grid} strokeWidth="1.2">
        <circle cx="9" cy="5" r="3.2" />
        <path d="M3 17c0-3.6 2.7-6.2 6-6.2s6 2.6 6 6.2z" />
      </g>
      <g fill={c} clipPath={`url(#clip-${Math.round(fill * 100)})`}>
        <circle cx="9" cy="5" r="3.2" />
        <path d="M3 17c0-3.6 2.7-6.2 6-6.2s6 2.6 6 6.2z" />
      </g>
    </svg>
  );
  return (
    <div className="chart-body">
      <div className="picto-key">
        <Icon fill={1} /> = {formatValue(unit)} {label}
      </div>
      <ul className="picto" aria-label={`Pictograph of ${label}`}>
        {items.map((it) => {
          const units = it.value / unit;
          const whole = Math.floor(units);
          const part = units - whole;
          return (
            <li key={it.name} className="picto-row" title={`${it.name}: ${formatValue(it.value)}`}>
              <span className="picto-label">{it.name}</span>
              <span className="picto-icons">
                {Array.from({ length: whole }, (_, i) => (
                  <Icon key={i} fill={1} />
                ))}
                {part >= 0.05 && <Icon fill={Math.round(part * 4) / 4 || 0.25} />}
              </span>
              <span className="picto-value">{formatCompact(it.value)}</span>
            </li>
          );
        })}
      </ul>
      {totalCategories > items.length && <Note>Showing the top {items.length} of {totalCategories} categories</Note>}
    </div>
  );
}

/* ---------- gantt ---------- */

const DAY = 86_400_000;

export function GanttView({ dataset, config, theme, height }: ViewProps) {
  const { tasks, groups, total } = useMemo(() => aggregateGantt(dataset, config), [dataset, config]);
  const [ref, width] = useWidth<HTMLDivElement>();
  const { node: tipNode, bind } = useHoverTip();
  if (!tasks.length) return <Empty height={height} message="Choose a task column and start/end date columns." />;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  if (config.options.showTable)
    return (
      <DataTable
        columns={[
          { key: 'name', label: config.xField ?? 'Task' },
          { key: 's', label: 'Start' },
          { key: 'e', label: 'End' },
          { key: 'd', label: 'Days', numeric: true },
        ]}
        rows={tasks.map((t) => ({ name: t.name, s: iso(t.start), e: iso(t.end - DAY), d: Math.round((t.end - t.start) / DAY) }))}
        maxHeight={height}
      />
    );
  const t0 = Math.min(...tasks.map((t) => t.start));
  const t1 = Math.max(...tasks.map((t) => t.end));
  const labelW = Math.min(180, Math.max(90, width * 0.22));
  const rowH = 26;
  const m = { top: 26, right: 12 };
  const w = Math.max(width, 320);
  const svgH = m.top + tasks.length * rowH + 8;
  const x = linear([t0, t1], [labelW, w - m.right]);
  const spanDays = (t1 - t0) / DAY;
  // Month ticks for long spans, weekly otherwise.
  const ticks: { t: number; label: string }[] = [];
  const d = new Date(t0);
  if (spanDays > 70) {
    d.setUTCDate(1);
    while (d.getTime() <= t1) {
      if (d.getTime() >= t0) ticks.push({ t: d.getTime(), label: d.toLocaleDateString(undefined, { month: 'short', year: spanDays > 400 ? '2-digit' : undefined, timeZone: 'UTC' }) });
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
  } else {
    while (d.getTime() <= t1) {
      ticks.push({ t: d.getTime(), label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) });
      d.setUTCDate(d.getUTCDate() + 7);
    }
  }
  const colorOf = (g: string | null) => {
    if (g === null) return seriesColor(theme, 0);
    const i = groups.indexOf(g);
    return seriesColor(theme, i < 8 ? i : -1);
  };
  const now = Date.now();
  return (
    <div className="chart-body">
      {groups.length > 1 && <Legend items={groups.slice(0, 8).map((g) => ({ label: g, color: colorOf(g) }))} />}
      <div ref={ref} className="gantt-scroll" style={{ maxHeight: height + 80 }}>
        {width > 0 && (
          <svg width={w} height={svgH} role="img" aria-label={`Gantt chart of ${tasks.length} tasks`}>
            {ticks.map((tk) => (
              <g key={tk.t}>
                <line x1={x(tk.t)} x2={x(tk.t)} y1={m.top - 4} y2={svgH} stroke={theme.grid} />
                <text x={x(tk.t) + 3} y={14} fill={theme.muted} fontSize={11}>
                  {tk.label}
                </text>
              </g>
            ))}
            {now > t0 && now < t1 && (
              <g>
                <line x1={x(now)} x2={x(now)} y1={m.top - 6} y2={svgH} stroke={theme.textSecondary} strokeWidth={1.5} />
                <text x={x(now) + 3} y={m.top - 8} fill={theme.textSecondary} fontSize={10} fontWeight={600}>
                  Today
                </text>
              </g>
            )}
            {tasks.map((t, i) => {
              const yy = m.top + i * rowH;
              const days = Math.round((t.end - t.start) / DAY);
              return (
                <g key={`${t.name}-${i}`}>
                  <text x={0} y={yy + rowH / 2} dominantBaseline="central" fill={theme.textSecondary} fontSize={12}>
                    {truncate(t.name, Math.floor(labelW / 7.2))}
                  </text>
                  <rect
                    x={x(t.start)}
                    y={yy + 6}
                    width={Math.max(4, x(t.end) - x(t.start))}
                    height={rowH - 12}
                    rx={4}
                    fill={colorOf(t.group)}
                    {...bind(
                      <TooltipCard
                        title={t.name}
                        rows={[
                          { label: 'Start', value: iso(t.start) },
                          { label: 'End', value: iso(t.end - DAY) },
                          { label: 'Duration', value: `${days} day${days === 1 ? '' : 's'}` },
                          ...(t.group ? [{ label: config.groupField ?? 'Group', value: t.group, color: colorOf(t.group) }] : []),
                        ]}
                      />,
                    )}
                  />
                </g>
              );
            })}
          </svg>
        )}
      </div>
      {total > tasks.length && <Note>Showing the first {tasks.length} of {total} tasks by start date</Note>}
      {tipNode}
    </div>
  );
}

/* ---------- dot plot ---------- */

export function DotPlotView({ dataset, config, theme, height }: ViewProps) {
  const cfg = useMemo(() => ({ ...config, yFields: config.yFields.slice(0, 3) }), [config]);
  const { data, series, totalCategories } = useMemo(() => aggregateCategories(dataset, cfg), [dataset, cfg]);
  const [ref, width] = useWidth<HTMLDivElement>();
  const { node: tipNode, bind } = useHoverTip();
  if (!data.length) return <Empty height={height} />;
  if (config.options.showTable)
    return <DataTable columns={[{ key: CATEGORY_KEY, label: config.xField ?? 'Category' }, ...series.map((s) => ({ key: s.key, label: s.label, numeric: true }))]} rows={data} maxHeight={height} />;
  const vals = data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0));
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(...vals), 5);
  const labelW = Math.min(160, Math.max(80, width * 0.25));
  const rowH = 26;
  const m = { top: 8, right: 16, bottom: 26 };
  const w = Math.max(width, 260);
  const svgH = m.top + data.length * rowH + m.bottom;
  const x = linear([ticks[0], ticks[ticks.length - 1]], [labelW, w - m.right]);
  const fmt = axisFormatter(Math.max(...vals.map(Math.abs)));
  return (
    <div className="chart-body">
      {series.length > 1 && <Legend items={series.map((s) => ({ label: s.label, color: seriesColor(theme, s.colorIndex) }))} />}
      <div ref={ref} className="gantt-scroll" style={{ maxHeight: height + 60 }}>
        {width > 0 && (
          <svg width={w} height={svgH} role="img" aria-label={`Dot plot of ${series.map((s) => s.label).join(', ')} by ${config.xField}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={m.top} y2={svgH - m.bottom} stroke={theme.grid} />
                <text x={x(t)} y={svgH - 8} textAnchor="middle" fill={theme.muted} fontSize={11}>
                  {fmt(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const yy = m.top + i * rowH + rowH / 2;
              const vs = series.map((s) => Number(d[s.key]) || 0);
              const name = String(d[CATEGORY_KEY]);
              return (
                <g key={name}>
                  <text x={0} y={yy} dominantBaseline="central" fill={theme.textSecondary} fontSize={12}>
                    {truncate(name, Math.floor(labelW / 7.2))}
                  </text>
                  <line x1={labelW} x2={w - m.right} y1={yy} y2={yy} stroke={theme.grid} strokeOpacity={0.6} />
                  {series.length > 1 && <line x1={x(Math.min(...vs))} x2={x(Math.max(...vs))} y1={yy} y2={yy} stroke={theme.axis} strokeWidth={2} />}
                  {series.map((s, j) => (
                    <circle
                      key={s.key}
                      cx={x(vs[j])}
                      cy={yy}
                      r={5}
                      fill={seriesColor(theme, s.colorIndex)}
                      stroke={theme.surface}
                      strokeWidth={2}
                      {...bind(<TooltipCard title={name} rows={series.map((ss, k) => ({ label: ss.label, value: formatValue(vs[k]), color: seriesColor(theme, ss.colorIndex) }))} />)}
                    />
                  ))}
                  {config.options.showLabels && series.length === 1 && (
                    <text x={x(vs[0]) + 9} y={yy} dominantBaseline="central" fill={theme.textSecondary} fontSize={11}>
                      {formatCompact(vs[0])}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>
      {config.options.topN > 0 && totalCategories > data.length && <Note>Showing top {data.length} of {totalCategories} categories</Note>}
      {tipNode}
    </div>
  );
}
