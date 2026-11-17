import type { ChartOptions, ChartType, ColumnType, FieldRole } from '../types';
import type { ColumnProfile, DatasetProfile } from './profile';

/**
 * Every chart type the app offers, with guidance on when to use it and a
 * fit check against the selected dataset. Grouping follows ThoughtSpot's
 * "types of charts and graphs" guide.
 */

export type ChartGroup = 'Foundational' | 'Comparing values' | 'Relationships & correlations' | 'Trends over time' | 'Geographic & grids' | 'Other notable';

export const GROUP_ORDER: ChartGroup[] = ['Foundational', 'Comparing values', 'Relationships & correlations', 'Trends over time', 'Geographic & grids', 'Other notable'];

export interface FieldSpec {
  role: FieldRole;
  label: string;
  accepts: ColumnType[];
  required: boolean;
  /** Only for role 'y': pick several value columns, one series each. */
  multi?: boolean;
  max?: number;
  hint?: string;
  /** For an optional value column: what the empty choice means. */
  emptyLabel?: string;
}

export type FitLevel = 'good' | 'possible' | 'no';
export type Picks = Partial<Record<FieldRole, string | string[]>>;

export interface Suggestion {
  level: FitLevel;
  reason: string;
  picks: Picks;
  /** Ranking for the "suggested" strip: specific matches (maps, OHLC, Gantt) outrank generic ones. */
  score: number;
}

export interface ChartTypeDef {
  type: ChartType;
  name: string;
  group: ChartGroup;
  short: string;
  what: string;
  when: string[];
  avoid: string[];
  needs: string;
  fields: FieldSpec[];
  /** Show the sum/avg/count/min/max choice. */
  aggregate?: boolean;
  /** Offer day/month/quarter/year grouping when x is a date. */
  bucket?: boolean;
  /** Offer the "labels to include" checklist for x. */
  filter?: boolean;
  defaultOptions?: Partial<ChartOptions>;
  defaultWidth?: ChartOptions['width'];
  suggest: (p: DatasetProfile) => Suggestion;
}

/* ---------- helpers ---------- */

const good = (reason: string, picks: Picks, score = 3): Suggestion => ({ level: 'good', reason, picks, score });
const possible = (reason: string, picks: Picks = {}, score = 1.5): Suggestion => ({ level: 'possible', reason, picks, score });
const no = (reason: string): Suggestion => ({ level: 'no', reason, picks: {}, score: 0 });

const LABEL: ColumnType[] = ['string', 'date'];
const NUM: ColumnType[] = ['number'];
const DATE: ColumnType[] = ['date'];
const TEXT: ColumnType[] = ['string'];

/** First category column with a distinct count in range. */
function cat(p: DatasetProfile, max = 60, min = 2, except?: string): ColumnProfile | undefined {
  return p.categories.find((c) => c.distinct >= min && c.distinct <= max && c.name !== except);
}
function measure(p: DatasetProfile, nth = 0): ColumnProfile | undefined {
  return p.measures[nth];
}
/** Value pick + human phrase: "Revenue", or "row count" when there's no measure. */
function valueOf(p: DatasetProfile): { y: string[]; phrase: string } {
  const m = measure(p);
  return m ? { y: [m.name], phrase: m.name } : { y: [], phrase: 'row counts' };
}
const n = (c: ColumnProfile) => `${c.distinct} ${c.name} value${c.distinct === 1 ? '' : 's'}`;

const xLabel = (label = 'Label column (categories)'): FieldSpec => ({ role: 'x', label, accepts: LABEL, required: true });
const yMulti = (hint = 'Each column becomes a series. None selected = count rows.'): FieldSpec => ({ role: 'y', label: 'Value columns', accepts: NUM, required: false, multi: true, max: 8, hint });
const ySingle = (label = 'Value column', required = false): FieldSpec => ({ role: 'y', label, accepts: NUM, required, emptyLabel: required ? undefined : 'Row count' });

/* ---------- the catalogue ---------- */

export const CHART_TYPES: ChartTypeDef[] = [
  // ---------------- Foundational ----------------
  {
    type: 'bar',
    name: 'Bar chart',
    group: 'Foundational',
    short: 'Compare values across categories',
    what: 'Horizontal bars whose length is proportional to each category’s value.',
    when: ['Comparing a measure across categories or groups', 'Category names are long (they read easily down the side)', 'Showing a ranking with many categories'],
    avoid: ['Showing a trend over time (use a line chart)', 'Too many bars to read; use the Top N slider'],
    needs: 'One label column + one or more numeric columns (or row count).',
    fields: [xLabel(), yMulti()],
    aggregate: true,
    bucket: true,
    filter: true,
    defaultOptions: { horizontal: true, sort: 'desc' },
    suggest: (p) => {
      const c = cat(p, 30) ?? cat(p);
      const v = valueOf(p);
      if (!c) return p.dates[0] ? possible(`No text categories; would compare ${v.phrase} by ${p.dates[0].name}.`, { x: p.dates[0].name, y: v.y }) : no('Needs a text or date column to use as categories.');
      if (c.distinct > 30) return possible(`${n(c)}: use the Top N slider to keep it readable.`, { x: c.name, y: v.y });
      return good(`Compare ${v.phrase} across ${n(c)}.`, { x: c.name, y: v.y }, 3.2);
    },
  },
  {
    type: 'histogram',
    name: 'Histogram',
    group: 'Foundational',
    short: 'Distribution of one numeric column',
    what: 'Groups a single continuous numeric column into equal-width bins and shows how many rows fall in each.',
    when: ['Seeing the spread, shape and variation of values', 'Spotting skew, gaps and outliers'],
    avoid: ['Small datasets: with few rows the bins are mostly empty', 'Comparing categories (use a bar chart)'],
    needs: 'One numeric column with plenty of rows (ideally 30+).',
    fields: [ySingle('Numeric column', true)],
    defaultOptions: { bins: 0 },
    suggest: (p) => {
      const m = measure(p) ?? p.columns.find((c) => c.type === 'number');
      if (!m) return no('Needs a numeric column.');
      if (m.nonNull < 15) return possible(`Only ${m.nonNull} values in ${m.name}; too few for a meaningful distribution.`, { y: [m.name] }, 0.5);
      if (m.nonNull < 30) return possible(`${m.nonNull} values in ${m.name}: a histogram works, but more rows give a clearer shape.`, { y: [m.name] });
      return good(`See how ${m.nonNull.toLocaleString()} ${m.name} values are distributed.`, { y: [m.name] }, 2.6);
    },
  },
  {
    type: 'column',
    name: 'Column chart',
    group: 'Foundational',
    short: 'Vertical bars, the most versatile chart',
    what: 'Vertical bars proportional to each category’s value.',
    when: ['Comparing a few categories', 'Showing rankings or order', 'Periods such as months or quarters'],
    avoid: ['Many categories or long labels (use a horizontal bar chart)', '3D effects or heavy gridlines'],
    needs: 'One label column + one or more numeric columns (or row count).',
    fields: [xLabel('Label column (X axis)'), yMulti()],
    aggregate: true,
    bucket: true,
    filter: true,
    suggest: (p) => {
      const v = valueOf(p);
      const c = cat(p, 12);
      if (c) return good(`${n(c)}: few enough to compare side by side.`, { x: c.name, y: v.y }, 3.1);
      const big = cat(p);
      if (big) return possible(`${n(big)}: a horizontal bar chart reads better at this size.`, { x: big.name, y: v.y });
      if (p.dates[0]) return possible(`Would plot ${v.phrase} per ${p.dates[0].name} period.`, { x: p.dates[0].name, y: v.y });
      return no('Needs a text or date column to use as categories.');
    },
  },
  {
    type: 'line',
    name: 'Line chart',
    group: 'Foundational',
    short: 'Trends over time or ordered labels',
    what: 'Points connected by straight lines to show how values change across an ordered axis.',
    when: ['Showing a trend, pattern or progression over time', 'Comparing how a few series move together'],
    avoid: ['Unordered categories (the connecting line implies an order)', 'More than a handful of series'],
    needs: 'A date (or ordered) column + one or more numeric columns.',
    fields: [xLabel('X axis (date or ordered label)'), yMulti()],
    aggregate: true,
    bucket: true,
    filter: true,
    defaultWidth: 'full',
    suggest: (p) => {
      const v = valueOf(p);
      if (p.dates[0]) return good(`Trend of ${v.phrase} over ${p.dates[0].name}.`, { x: p.dates[0].name, y: v.y }, 3.5);
      const c = cat(p);
      if (c) return possible(`No date column; a line across ${c.name} only makes sense if its values have a natural order.`, { x: c.name, y: v.y }, 1);
      return no('Needs a date or ordered column for the X axis.');
    },
  },
  {
    type: 'pie',
    name: 'Pie chart',
    group: 'Foundational',
    short: 'Share of a whole, few categories',
    what: 'A circle divided into slices, each showing a category’s share of the total.',
    when: ['Showing parts of a whole', 'Few categories, ideally six or fewer'],
    avoid: ['Many categories or near-equal slices (use a bar chart)', 'Values that don’t add up to a meaningful total'],
    needs: 'One category column + one numeric column (or row count).',
    fields: [xLabel('Slices (category column)'), ySingle('Slice size')],
    aggregate: true,
    bucket: true,
    filter: true,
    suggest: (p) => {
      const v = valueOf(p);
      const c = cat(p, 7);
      if (c) return good(`${v.phrase} split across ${n(c)}: few enough slices to read.`, { x: c.name, y: v.y }, 2.8);
      const big = cat(p, 30);
      if (big) return possible(`${n(big)}: smaller ones fold into “Other”. A bar or donut chart may read better.`, { x: big.name, y: v.y }, 1.2);
      return no('Needs a category column with a handful of values.');
    },
  },
  {
    type: 'kpi',
    name: 'KPI',
    group: 'Foundational',
    short: 'One headline number',
    what: 'A single prominent figure, such as total revenue or order count, for a quick status check.',
    when: ['Leading a dashboard with the metric that matters most', 'Finance, sales and operations summaries'],
    avoid: ['Too many KPIs at once; each loses impact'],
    needs: 'One numeric column (or row count).',
    fields: [ySingle()],
    aggregate: true,
    defaultWidth: 'third',
    suggest: (p) => {
      const v = valueOf(p);
      return v.y.length ? good(`Headline total of ${v.phrase}.`, { y: v.y }, 2.9) : possible('No numeric column; it would show the row count.', { y: [] });
    },
  },
  {
    type: 'donut',
    name: 'Donut chart',
    group: 'Foundational',
    short: 'Pie with a centre total',
    what: 'A pie chart with a hole in the middle that shows the overall total.',
    when: ['Showing how categories contribute to a whole', 'You want the total visible at a glance'],
    avoid: ['More than about eight categories', '3D effects'],
    needs: 'One category column + one numeric column (or row count).',
    fields: [xLabel('Slices (category column)'), ySingle('Slice size')],
    aggregate: true,
    bucket: true,
    filter: true,
    suggest: (p) => {
      const v = valueOf(p);
      const c = cat(p, 8);
      if (c) return good(`${v.phrase} share across ${n(c)}, with the total in the centre.`, { x: c.name, y: v.y }, 2.85);
      const big = cat(p, 30);
      if (big) return possible(`${n(big)}: the top 8 are shown, the rest grouped as “Other”.`, { x: big.name, y: v.y }, 1.3);
      return no('Needs a category column with a handful of values.');
    },
  },

  // ---------------- Comparing values ----------------
  {
    type: 'treemap',
    name: 'Treemap',
    group: 'Comparing values',
    short: 'Nested rectangles for hierarchy',
    what: 'Nested rectangles sized by value, showing part-to-whole within a hierarchy.',
    when: ['Hierarchical data (e.g. category → sub-category)', 'Many categories where a pie would be unreadable'],
    avoid: ['Precise comparisons between similar sizes', 'Negative values'],
    needs: 'A category column, an optional sub-category column, and a numeric column.',
    fields: [xLabel('Top level (category)'), { role: 'group', label: 'Second level (optional)', accepts: TEXT, required: false }, ySingle('Rectangle size')],
    aggregate: true,
    filter: true,
    suggest: (p) => {
      const v = valueOf(p);
      const c = cat(p, 30);
      if (!c) return no('Needs a category column.');
      const sub = cat(p, 60, 2, c.name);
      if (sub) return good(`Hierarchy ${c.name} → ${sub.name}, sized by ${v.phrase}.`, { x: c.name, group: sub.name, y: v.y }, 2.4);
      return possible(`Single level: ${n(c)}. Add a second category for a real hierarchy.`, { x: c.name, y: v.y });
    },
  },
  {
    type: 'pareto',
    name: 'Pareto chart',
    group: 'Comparing values',
    short: 'Ranked bars + cumulative share',
    what: 'Bars sorted from largest to smallest with a cumulative-percentage line, showing which few categories drive most of the total.',
    when: ['Finding the vital few causes or contributors (the 80/20 rule)', 'Prioritising problems by impact'],
    avoid: ['Only two or three categories', 'Values that can be negative'],
    needs: 'One category column with 4+ values + a numeric column (or count).',
    fields: [xLabel('Categories'), ySingle()],
    aggregate: true,
    filter: true,
    suggest: (p) => {
      const v = valueOf(p);
      const c = cat(p, 40, 4);
      if (c) return good(`Which ${c.name} values account for most of ${v.phrase}.`, { x: c.name, y: v.y }, 2.2);
      const small = cat(p);
      if (small) return possible(`${n(small)}: a Pareto needs more categories to be useful.`, { x: small.name, y: v.y }, 0.8);
      return no('Needs a category column.');
    },
  },
  {
    type: 'radar',
    name: 'Radar chart',
    group: 'Comparing values',
    short: 'Several dimensions on spokes',
    what: 'Values plotted on spokes radiating from a centre, forming a shape per series (also called a spider chart).',
    when: ['Comparing several dimensions in a compact space', 'Spotting strengths and gaps between a few series'],
    avoid: ['More than about 3 series or 12 spokes', 'Dimensions on very different scales'],
    needs: 'A category column with 3–12 values (the spokes) + one or more numeric columns.',
    fields: [xLabel('Spokes (category column)'), yMulti('Each column becomes one shape. Keep it to 3 or fewer.')],
    aggregate: true,
    filter: true,
    suggest: (p) => {
      const c = cat(p, 12, 3);
      // One measure by default: radar axes share a scale, so mixed units distort the shape.
      const ys = p.measures.slice(0, 1).map((m) => m.name);
      if (c && ys.length) return good(`${ys[0]} across ${n(c)} as spokes; add another column to compare shapes.`, { x: c.name, y: ys }, 1.8);
      const big = cat(p, 60, 3);
      if (big) return possible(`${n(big)}: only the top 12 fit as spokes.`, { x: big.name, y: ys });
      return no('Needs a category column with at least 3 values.');
    },
  },
  {
    type: 'funnel',
    name: 'Funnel chart',
    group: 'Comparing values',
    short: 'Drop-off across stages',
    what: 'Stages drawn from largest to smallest, showing progression or attrition through a process.',
    when: ['Sales pipelines, sign-up flows, conversion steps', 'Highlighting where the biggest drop happens'],
    avoid: ['Categories that aren’t sequential stages', 'Fewer than three stages'],
    needs: 'A stage column with 3+ values + a numeric column (or row count).',
    fields: [xLabel('Stages'), ySingle()],
    aggregate: true,
    filter: true,
    defaultOptions: { sort: 'desc', showLabels: true },
    suggest: (p) => {
      const v = valueOf(p);
      const stage = p.categories.find((c) => /stage|step|phase|funnel|status|pipeline/i.test(c.name) && c.distinct >= 3 && c.distinct <= 12);
      if (stage) return good(`${stage.name} looks like a sequence of stages.`, { x: stage.name, y: v.y }, 3.8);
      const c = cat(p, 10, 3);
      if (c) return possible(`Would treat each ${c.name} as a stage; only meaningful if they are sequential.`, { x: c.name, y: v.y }, 0.8);
      return no('Needs a column of 3+ sequential stages.');
    },
  },
  {
    type: 'waterfall',
    name: 'Waterfall chart',
    group: 'Comparing values',
    short: 'How increases & decreases add up',
    what: 'Floating bars showing how a starting value is raised and lowered by a series of positive and negative changes to reach a total.',
    when: ['Explaining how a total was reached (P&L, budget variance)', 'Showing the sequential impact of gains and losses'],
    avoid: ['Values that are all positive and unrelated (use a column chart)', 'Unordered categories'],
    needs: 'An ordered label column + a numeric column, ideally with negative values.',
    fields: [xLabel('Steps (label or date)'), ySingle('Change value', true)],
    aggregate: true,
    bucket: true,
    filter: true,
    defaultWidth: 'full',
    suggest: (p) => {
      const neg = p.measures.find((m) => m.hasNegative);
      const x = cat(p, 30) ?? p.dates[0];
      if (!x || !p.measures.length) return no('Needs a label column and a numeric column of changes.');
      if (neg) return good(`${neg.name} has gains and losses to cascade across ${x.name}.`, { x: x.name, y: [neg.name] }, 2.7);
      return possible(`${p.measures[0].name} has no negative values, so every step goes up. The chart works but shows only growth.`, { x: x.name, y: [p.measures[0].name] }, 0.9);
    },
  },
  {
    type: 'stacked',
    name: 'Stacked bar chart',
    group: 'Comparing values',
    short: 'Totals and their composition',
    what: 'Each bar is a total split into coloured segments, comparing parts of a whole across categories.',
    when: ['Comparing totals and what makes them up (e.g. revenue by region split by channel)', 'Composition over time'],
    avoid: ['Too many segments (keep to 8 or fewer)', 'Comparing the middle segments precisely'],
    needs: 'A label column + either a second category to split by or several numeric columns.',
    fields: [xLabel('Bars (label column)'), { role: 'group', label: 'Split each bar by (optional)', accepts: TEXT, required: false, hint: 'Up to 8 segments. With a split column, only the first value column is used.' }, yMulti('Without a split column, each value column becomes a segment.')],
    aggregate: true,
    bucket: true,
    filter: true,
    defaultOptions: { stacked: true },
    suggest: (p) => {
      const v = valueOf(p);
      const x = cat(p, 20) ?? p.dates[0];
      if (!x) return no('Needs a label column.');
      const split = cat(p, 8, 2, x.name);
      if (split) return good(`${v.phrase} by ${x.name}, each bar split by ${split.name}.`, { x: x.name, group: split.name, y: v.y }, 3);
      if (p.measures.length >= 2) return good(`${p.measures[0].name} + ${p.measures[1].name} stacked per ${x.name}.`, { x: x.name, y: [p.measures[0].name, p.measures[1].name] }, 2.5);
      return possible('Only one series to stack; add a split column or a second value column.', { x: x.name, y: v.y });
    },
  },

  // ---------------- Relationships ----------------
  {
    type: 'scatter',
    name: 'Scatter plot',
    group: 'Relationships & correlations',
    short: 'Relationship between two measures',
    what: 'One dot per row, positioned by two numeric columns, to reveal correlation, clusters and outliers.',
    when: ['Checking whether two measures move together', 'Finding clusters and outliers'],
    avoid: ['Categorical data', 'Fewer than ~10 rows'],
    needs: 'Two numeric columns.',
    fields: [{ role: 'x', label: 'X axis (numeric)', accepts: NUM, required: true }, ySingle('Y axis (numeric)', true)],
    suggest: (p) => {
      const nums = p.measures.length >= 2 ? p.measures : p.columns.filter((c) => c.type === 'number');
      if (nums.length < 2) return no('Needs two numeric columns.');
      if (p.rows < 10) return possible(`Only ${p.rows} rows; patterns will be hard to judge.`, { x: nums[0].name, y: [nums[1].name] }, 0.8);
      return good(`Does ${nums[1].name} rise with ${nums[0].name}?`, { x: nums[0].name, y: [nums[1].name] }, 2.3);
    },
  },
  {
    type: 'bubble',
    name: 'Bubble chart',
    group: 'Relationships & correlations',
    short: 'Scatter with a third measure as size',
    what: 'A scatter plot where each dot’s area encodes a third numeric value.',
    when: ['Comparing three measures at once', 'Showing which points matter most by size'],
    avoid: ['Many overlapping points', 'Size values that are negative'],
    needs: 'Three numeric columns.',
    fields: [{ role: 'x', label: 'X axis (numeric)', accepts: NUM, required: true }, ySingle('Y axis (numeric)', true), { role: 'size', label: 'Bubble size (numeric)', accepts: NUM, required: true }],
    suggest: (p) => {
      const m = p.measures.length >= 3 ? p.measures : p.columns.filter((c) => c.type === 'number');
      if (m.length < 3) return no(`Needs three numeric columns (found ${m.length}).`);
      return good(`${m[1].name} vs ${m[0].name}, sized by ${m[2].name}.`, { x: m[0].name, y: [m[1].name], size: m[2].name }, 2);
    },
  },
  {
    type: 'sankey',
    name: 'Sankey diagram',
    group: 'Relationships & correlations',
    short: 'Flows between two dimensions',
    what: 'Bands flowing from source nodes to target nodes, with band width proportional to the quantity.',
    when: ['Many-to-many relationships, e.g. product category → sales channel', 'Showing where volume goes'],
    avoid: ['Too many nodes (keep each side to ~10)', 'Data without a natural from → to relationship'],
    needs: 'Two category columns + an optional numeric column.',
    fields: [{ role: 'x', label: 'Source (from)', accepts: TEXT, required: true }, { role: 'group', label: 'Target (to)', accepts: TEXT, required: true }, ySingle('Flow size')],
    aggregate: true,
    defaultWidth: 'full',
    suggest: (p) => {
      const a = cat(p, 15);
      const b = a && cat(p, 15, 2, a.name);
      if (!a || !b) return no('Needs two category columns with up to ~15 values each.');
      const v = valueOf(p);
      return good(`Flow of ${v.phrase} from ${a.name} to ${b.name}.`, { x: a.name, group: b.name, y: v.y }, 2.1);
    },
  },
  {
    type: 'area',
    name: 'Area chart',
    group: 'Relationships & correlations',
    short: 'Magnitude of change over time',
    what: 'A line chart with the area beneath filled, emphasising volume and cumulative change.',
    when: ['Showing how totals change over time', 'Comparing two or more series, optionally stacked'],
    avoid: ['A single series (a line chart is clearer)', 'Many overlapping series'],
    needs: 'A date column + two or more numeric columns.',
    fields: [xLabel('X axis (date or ordered label)'), yMulti()],
    aggregate: true,
    bucket: true,
    filter: true,
    defaultWidth: 'full',
    suggest: (p) => {
      const d = p.dates[0];
      if (!d) return cat(p) ? possible('No date column; area charts are meant for change over time.', { x: cat(p)!.name, y: valueOf(p).y }, 0.6) : no('Needs a date column.');
      if (p.measures.length >= 2) return good(`${p.measures[0].name} and ${p.measures[1].name} over ${d.name}.`, { x: d.name, y: [p.measures[0].name, p.measures[1].name] }, 2.4);
      return possible('Only one numeric series; a line chart is usually clearer.', { x: d.name, y: valueOf(p).y });
    },
  },

  // ---------------- Trends over time ----------------
  {
    type: 'step',
    name: 'Step chart',
    group: 'Trends over time',
    short: 'Values that change in jumps',
    what: 'A line made of horizontal and vertical segments: values hold steady, then jump.',
    when: ['Prices, rates, inventory or status that change at discrete moments', 'Emphasising sudden changes over gradual trends'],
    avoid: ['Continuously changing measures (use a line chart)'],
    needs: 'A date column + a numeric column.',
    fields: [xLabel('X axis (date or ordered label)'), yMulti()],
    aggregate: true,
    bucket: true,
    filter: true,
    defaultWidth: 'full',
    suggest: (p) => {
      const d = p.dates[0];
      if (!d) return no('Needs a date column.');
      const stepLike = p.measures.find((m) => /price|rate|level|stock|inventory|status|tier|plan|headcount|balance/i.test(m.name));
      if (stepLike) return good(`${stepLike.name} likely changes in steps over ${d.name}.`, { x: d.name, y: [stepLike.name] }, 2.3);
      const v = valueOf(p);
      return possible(`Works with ${d.name}; best when ${v.phrase} changes in jumps rather than smoothly.`, { x: d.name, y: v.y });
    },
  },
  {
    type: 'candlestick',
    name: 'Candlestick chart',
    group: 'Trends over time',
    short: 'Open, high, low, close prices',
    what: 'Per period, a body spans open to close and thin wicks reach the high and low. Hollow = up, filled = down.',
    when: ['Stock, crypto or currency price analysis', 'Seeing volatility and direction per period'],
    avoid: ['Data without open/high/low/close values', 'Overloading with indicators'],
    needs: 'A date column + four numeric columns: open, high, low, close.',
    fields: [
      { role: 'x', label: 'Date', accepts: DATE, required: true },
      { role: 'open', label: 'Open', accepts: NUM, required: true },
      { role: 'high', label: 'High', accepts: NUM, required: true },
      { role: 'low', label: 'Low', accepts: NUM, required: true },
      { role: 'close', label: 'Close', accepts: NUM, required: true },
    ],
    bucket: true,
    defaultWidth: 'full',
    suggest: (p) => {
      if (p.ohlc && p.dates[0]) return good(`Found ${p.ohlc.open}/${p.ohlc.high}/${p.ohlc.low}/${p.ohlc.close} price columns.`, { x: p.dates[0].name, ...p.ohlc }, 5);
      return no('Needs open, high, low and close columns plus a date.');
    },
  },
  {
    type: 'sparkline',
    name: 'Sparkline',
    group: 'Trends over time',
    short: 'Tiny trend beside a number',
    what: 'A small line without axes, shown with the latest value and change, for at-a-glance trends.',
    when: ['Pairing a KPI with its recent direction', 'Space-limited summaries'],
    avoid: ['When readers need exact values or axes'],
    needs: 'A date column + a numeric column.',
    fields: [{ role: 'x', label: 'Date', accepts: LABEL, required: true }, ySingle()],
    aggregate: true,
    bucket: true,
    defaultWidth: 'third',
    suggest: (p) => {
      const d = p.dates[0];
      if (!d) return no('Needs a date column.');
      const v = valueOf(p);
      return good(`Latest ${v.phrase} with its trend over ${d.name}.`, { x: d.name, y: v.y }, 2.5);
    },
  },

  // ---------------- Geographic ----------------
  {
    type: 'geo',
    name: 'Geo chart (map)',
    group: 'Geographic & grids',
    short: 'Shade countries or US states',
    what: 'A map where each country or US state is shaded by its value (a choropleth).',
    when: ['Comparing performance across regions, e.g. sales by country or state'],
    avoid: ['Regions the map doesn’t know (cities, custom territories)', 'When land area would mislead (big regions dominate)'],
    needs: 'A column of country names/codes or US state names/abbreviations + an optional numeric column.',
    fields: [{ role: 'x', label: 'Location (country or US state)', accepts: TEXT, required: true }, ySingle()],
    aggregate: true,
    defaultWidth: 'full',
    suggest: (p) => {
      if (!p.geo) return no('Needs a column of country or US state names.');
      const v = valueOf(p);
      return good(`${p.geo.column} matches ${p.geo.scope === 'usa' ? 'US states' : 'countries'} (${Math.round(p.geo.rate * 100)}%); shade by ${v.phrase}.`, { x: p.geo.column, y: v.y }, 4.5);
    },
  },
  {
    type: 'scattermap',
    name: 'Scatter map',
    group: 'Geographic & grids',
    short: 'Points at latitude/longitude',
    what: 'One dot per row placed at its coordinates, showing spatial distribution.',
    when: ['Store locations, deliveries, incidents, check-ins'],
    avoid: ['Data without coordinates', 'Very dense points without zoom'],
    needs: 'Latitude and longitude numeric columns.',
    fields: [
      { role: 'lat', label: 'Latitude', accepts: NUM, required: true },
      { role: 'lon', label: 'Longitude', accepts: NUM, required: true },
      { role: 'size', label: 'Dot size (optional)', accepts: NUM, required: false },
    ],
    defaultWidth: 'full',
    suggest: (p) => {
      if (p.lat && p.lon) return good(`Found coordinates in ${p.lat} / ${p.lon}.`, { lat: p.lat, lon: p.lon }, 4.6);
      return no('Needs latitude and longitude columns.');
    },
  },
  {
    type: 'geobubble',
    name: 'Geographic bubble chart',
    group: 'Geographic & grids',
    short: 'Sized bubbles on a map',
    what: 'A bubble at each country or state, sized by its value, so position and scale read together.',
    when: ['Comparing totals across locations without land area skewing the picture', 'Spotting regional outliers'],
    avoid: ['Many locations close together', 'Locations the map can’t place'],
    needs: 'A country/US state column + a numeric column (or row count).',
    fields: [{ role: 'x', label: 'Location (country or US state)', accepts: TEXT, required: true }, ySingle('Bubble size')],
    aggregate: true,
    defaultWidth: 'full',
    suggest: (p) => {
      if (!p.geo) return no('Needs a column of country or US state names.');
      const v = valueOf(p);
      return good(`Bubble per ${p.geo.column}, sized by ${v.phrase}.`, { x: p.geo.column, y: v.y }, 4);
    },
  },
  {
    type: 'heatmap',
    name: 'Heatmap',
    group: 'Geographic & grids',
    short: 'Colour-coded grid of two dimensions',
    what: 'A grid with one dimension across and another down; each cell is shaded by its value.',
    when: ['Finding patterns across two categorical dimensions (e.g. region × month)', 'Spotting hot and cold combinations'],
    avoid: ['Reading exact values (turn on values or use a table)', 'Huge grids'],
    needs: 'Two category/date columns + an optional numeric column.',
    fields: [xLabel('Columns (across)'), { role: 'group', label: 'Rows (down)', accepts: LABEL, required: true }, ySingle('Cell value')],
    aggregate: true,
    bucket: true,
    defaultWidth: 'full',
    suggest: (p) => {
      const v = valueOf(p);
      const rows = cat(p, 30);
      if (rows && p.dates[0]) return good(`${rows.name} × ${p.dates[0].name} (by month), shaded by ${v.phrase}.`, { x: p.dates[0].name, group: rows.name, y: v.y }, 2.6);
      const cols = rows && cat(p, 30, 2, rows.name);
      if (rows && cols) return good(`${rows.name} × ${cols.name}, shaded by ${v.phrase}.`, { x: cols.name, group: rows.name, y: v.y }, 2.4);
      return no('Needs two category or date columns.');
    },
  },

  // ---------------- Other ----------------
  {
    type: 'boxplot',
    name: 'Box plot',
    group: 'Other notable',
    short: 'Median, quartiles & outliers',
    what: 'Each box spans the middle 50% of values with a line at the median; whiskers reach 1.5× IQR and dots mark outliers.',
    when: ['Comparing spread and variability across groups', 'Spotting outliers'],
    avoid: ['Very few values per group', 'Audiences unfamiliar with quartiles'],
    needs: 'A numeric column (many rows) + an optional group column.',
    fields: [{ role: 'x', label: 'Group by (optional)', accepts: LABEL, required: false }, ySingle('Numeric column', true)],
    filter: true,
    suggest: (p) => {
      const m = measure(p);
      if (!m) return no('Needs a numeric column.');
      if (p.rows < 20) return possible(`Only ${p.rows} rows; quartiles will be unstable.`, { y: [m.name] }, 0.6);
      const g = cat(p, 12);
      if (g) return good(`Spread of ${m.name} compared across ${n(g)}.`, { x: g.name, y: [m.name] }, 2.2);
      return possible(`One box for ${m.name}; add a group column to compare.`, { y: [m.name] });
    },
  },
  {
    type: 'pictograph',
    name: 'Pictograph',
    group: 'Other notable',
    short: 'Icons representing quantities',
    what: 'Rows of icons where each icon stands for a fixed amount.',
    when: ['Simple comparisons for a general audience', 'Storytelling and infographics'],
    avoid: ['When precision matters (icons round values)', 'More than a handful of categories'],
    needs: 'A category column with few values + a numeric column (or row count).',
    fields: [xLabel('Categories'), ySingle()],
    aggregate: true,
    filter: true,
    suggest: (p) => {
      const v = valueOf(p);
      const c = cat(p, 6);
      if (c) return good(`Icons for ${v.phrase} across ${n(c)}.`, { x: c.name, y: v.y }, 1.4);
      const big = cat(p, 30);
      if (big) return possible(`${n(big)}: only the top few fit as icon rows.`, { x: big.name, y: v.y }, 0.7);
      return no('Needs a category column.');
    },
  },
  {
    type: 'gantt',
    name: 'Gantt chart',
    group: 'Other notable',
    short: 'Tasks on a timeline',
    what: 'A horizontal bar per task from its start date to its end date, showing durations and overlaps.',
    when: ['Project timelines, milestones and schedules', 'Seeing overlaps across teams'],
    avoid: ['Data without start and end dates'],
    needs: 'A task name column + start date + end date columns (optional group for colour).',
    fields: [
      { role: 'x', label: 'Task', accepts: TEXT, required: true },
      { role: 'start', label: 'Start date', accepts: DATE, required: true },
      { role: 'end', label: 'End date', accepts: DATE, required: true },
      { role: 'group', label: 'Colour by (optional)', accepts: TEXT, required: false, hint: 'e.g. team or phase; up to 8 colours.' },
    ],
    defaultWidth: 'full',
    suggest: (p) => {
      if (p.task && p.start && p.end) {
        const g = cat(p, 8, 2, p.task);
        return good(`${p.task} from ${p.start} to ${p.end}.`, { x: p.task, start: p.start, end: p.end, ...(g ? { group: g.name } : {}) }, 4.8);
      }
      return no('Needs a task column plus start and end date columns.');
    },
  },
  {
    type: 'dotplot',
    name: 'Dot plot',
    group: 'Other notable',
    short: 'Precise values as dots',
    what: 'A dot per category at its value on a shared axis. Cleaner than bars when precision matters.',
    when: ['Comparing values precisely across categories', 'Comparing two or three measures per category'],
    avoid: ['Large datasets with many categories'],
    needs: 'A category column + one to three numeric columns.',
    fields: [xLabel('Categories'), yMulti('Up to 3 columns; each gets its own dot.')],
    aggregate: true,
    filter: true,
    defaultOptions: { sort: 'desc' },
    suggest: (p) => {
      const c = cat(p, 25);
      const ys = p.measures.slice(0, 2).map((m) => m.name);
      if (c) return good(`${ys.length ? ys.join(' vs ') : 'Row counts'} per ${c.name}, plotted precisely.`, { x: c.name, y: ys }, 1.9);
      return no('Needs a category column with up to ~25 values.');
    },
  },
];

export const CHART_DEFS: Record<ChartType, ChartTypeDef> = Object.fromEntries(CHART_TYPES.map((d) => [d.type, d])) as Record<ChartType, ChartTypeDef>;

export const FIT_LABEL: Record<FitLevel, string> = { good: 'Good fit', possible: 'Possible', no: 'Not suitable' };

