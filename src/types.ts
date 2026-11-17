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

export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'scatter' | 'kpi';
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
};
