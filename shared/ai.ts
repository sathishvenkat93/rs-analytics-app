/**
 * Contract between the browser app and the AI server.
 * No imports: this file is loaded by both Vite (browser) and Node (server).
 */

export const CHART_TYPE_IDS = [
  'bar',
  'column',
  'histogram',
  'line',
  'pie',
  'kpi',
  'donut',
  'treemap',
  'pareto',
  'radar',
  'funnel',
  'waterfall',
  'stacked',
  'scatter',
  'bubble',
  'sankey',
  'area',
  'step',
  'candlestick',
  'sparkline',
  'geo',
  'scattermap',
  'geobubble',
  'heatmap',
  'boxplot',
  'pictograph',
  'gantt',
  'dotplot',
] as const;
export type AiChartType = (typeof CHART_TYPE_IDS)[number];

export const AGGREGATIONS = ['sum', 'avg', 'count', 'min', 'max'] as const;
export const DATE_BUCKETS = ['none', 'day', 'month', 'quarter', 'year'] as const;
export const SORTS = ['none', 'asc', 'desc'] as const;

/* ---------- what the browser sends ---------- */

export interface ColumnSummary {
  name: string;
  type: 'number' | 'date' | 'string';
  distinct: number;
  /** Share of empty cells, 0–1. */
  missing: number;
  /** A few distinct example values, truncated. */
  examples: (string | number)[];
  min?: number | string;
  max?: number | string;
  mean?: number;
}

export interface DatasetSummary {
  id: string;
  name: string;
  fileName: string;
  rows: number;
  columns: ColumnSummary[];
  /** A handful of rows, values truncated. */
  sample: Record<string, string | number | null>[];
}

/** One chart type and the column slots it takes (from the app's chart registry). */
export interface ChartTypeInfo {
  type: AiChartType;
  name: string;
  use: string;
  fields: { role: string; label: string; accepts: string[]; required: boolean; multi?: boolean }[];
  aggregate: boolean;
}

/* ---------- what the model returns ---------- */

export interface AiChartSpec {
  type: AiChartType;
  title: string;
  /** Label / category / X column. */
  x: string | null;
  /** Value columns. Empty with aggregation "count" = row count. */
  y: string[];
  /** Split / rows / target / colour column, depending on type. */
  group: string | null;
  /** Bubble or dot size column. */
  size: string | null;
  extra: { open: string | null; high: string | null; low: string | null; close: string | null; start: string | null; end: string | null; lat: string | null; lon: string | null };
  aggregation: (typeof AGGREGATIONS)[number];
  dateBucket: (typeof DATE_BUCKETS)[number];
  topN: number | null;
  sort: (typeof SORTS)[number];
  stacked: boolean;
  horizontal: boolean;
  showLabels: boolean;
  includeCategories: string[] | null;
  /** One sentence: why this chart, for this data. */
  rationale: string;
}

export interface ColumnAdvice {
  reportType: string;
  renames: { original: string; suggested: string; reason: string }[];
  discard: { column: string; reason: string }[];
}

export interface SuggestRequest {
  dataset: DatasetSummary;
  catalog: ChartTypeInfo[];
  count: number;
  goal?: string;
  /** Titles of charts already on the dashboard, to avoid repeats. */
  existing?: string[];
}
export interface SuggestResult {
  reportType: string;
  summary: string;
  dashboardName: string;
  charts: AiChartSpec[];
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  /** The chart the assistant returned on that turn, as it stood (including manual edits). */
  chart?: { datasetId: string; spec: AiChartSpec } | null;
}
export interface ChatRequest {
  datasets: DatasetSummary[];
  catalog: ChartTypeInfo[];
  history: ChatTurn[];
  message: string;
  /** The chart being refined right now, if any. */
  current: { datasetId: string; spec: AiChartSpec } | null;
}
export interface ChatResult {
  reply: string;
  datasetId: string | null;
  chart: AiChartSpec | null;
}

export interface SqlRequest {
  tables: { name: string; dataset: string; columns: { name: string; type: string }[]; sample: Record<string, string | number | null>[] }[];
  question: string;
}
export interface SqlResult {
  sql: string;
  explanation: string;
}

export interface AiStatus {
  provider: 'bedrock' | 'mock' | 'off';
  model: string | null;
  configured: boolean;
  message: string;
}

export interface AiErrorBody {
  error: { kind: 'config' | 'auth' | 'model' | 'rate_limit' | 'refusal' | 'network' | 'bad_request' | 'output' | 'server'; message: string };
}
