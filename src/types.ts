export type ColumnType = 'number' | 'date' | 'string';

export interface Column {
  name: string;
  type: ColumnType;
}

export type CellValue = string | number | null;
export type Row = Record<string, CellValue>;

export interface Dataset {
  id: string;
  name: string;
  fileName: string;
  columns: Column[];
  rows: Row[];
  createdAt: number;
}

export type ChartType =
  | 'bar'
  | 'column'
  | 'histogram'
  | 'line'
  | 'pie'
  | 'kpi'
  | 'donut'
  | 'treemap'
  | 'pareto'
  | 'radar'
  | 'funnel'
  | 'waterfall'
  | 'stacked'
  | 'scatter'
  | 'bubble'
  | 'sankey'
  | 'area'
  | 'step'
  | 'candlestick'
  | 'sparkline'
  | 'geo'
  | 'scattermap'
  | 'geobubble'
  | 'heatmap'
  | 'boxplot'
  | 'pictograph'
  | 'gantt'
  | 'dotplot';

/** Column slots beyond label (x) and values (y). */
export type ExtraRole = 'open' | 'high' | 'low' | 'close' | 'start' | 'end' | 'lat' | 'lon';
/** Every column slot a chart type can ask for. */
export type FieldRole = 'x' | 'y' | 'group' | 'size' | ExtraRole;
export type Aggregation = 'sum' | 'avg' | 'count' | 'min' | 'max';
export type DateBucket = 'none' | 'day' | 'month' | 'quarter' | 'year';
export type SortOrder = 'none' | 'asc' | 'desc';

export interface ChartOptions {
  /** Max categories shown (bar) or slices before folding into "Other" (pie). 0 = all. */
  topN: number;
  sort: SortOrder;
  stacked: boolean;
  horizontal: boolean;
  showLabels: boolean;
  donut: boolean;
  width: 'third' | 'half' | 'full';
  showTable: boolean;
  /** Histogram bin count. */
  bins: number;
}

export interface ChartConfig {
  id: string;
  title: string;
  type: ChartType;
  datasetId: string;
  /** Category / label column (bar, line, area, pie) or X measure (scatter). */
  xField: string | null;
  /** Value columns. Pie, scatter and KPI use the first one. Empty + count = row count. */
  yFields: string[];
  /** Secondary category: stack split, heatmap rows, Sankey target, treemap child, Gantt colour. */
  groupField: string | null;
  /** Bubble size measure. */
  sizeField: string | null;
  /** OHLC, start/end dates, latitude/longitude. */
  extra: Partial<Record<ExtraRole, string>>;
  aggregation: Aggregation;
  dateBucket: DateBucket;
  /** Category values to keep. null = keep all. */
  includeCategories: string[] | null;
  options: ChartOptions;
}

export const DEFAULT_OPTIONS: ChartOptions = {
  topN: 0,
  sort: 'none',
  stacked: false,
  horizontal: false,
  showLabels: false,
  donut: true,
  width: 'half',
  showTable: false,
  bins: 0,
};
