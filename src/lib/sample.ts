import type { ChartConfig, ChartType, Dataset } from '../types';
import { buildTable } from './infer';
import type { ParsedTable } from './parsers';
import { autoTitle, blankConfig } from '../charts/config';

/** Deterministic demo datasets so every chart type can be tried without a file. */

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}
const pad = (n: number) => String(n).padStart(2, '0');
const r2 = (n: number) => Math.round(n * 100) / 100;

export function sampleSalesData(): ParsedTable {
  const rand = rng(42);
  const regions: [string, string[]][] = [
    ['North', ['New York', 'Massachusetts', 'Michigan', 'Illinois']],
    ['South', ['Texas', 'Florida', 'Georgia', 'Tennessee']],
    ['East', ['Pennsylvania', 'New Jersey', 'Virginia', 'North Carolina']],
    ['West', ['California', 'Washington', 'Oregon', 'Colorado', 'Arizona']],
  ];
  const categories: [string, number][] = [
    ['Electronics', 420],
    ['Furniture', 260],
    ['Office Supplies', 45],
    ['Clothing', 70],
    ['Groceries', 25],
  ];
  const channels = ['Online', 'Retail', 'Wholesale'];
  const header = ['Order Date', 'Region', 'State', 'Category', 'Channel', 'Units', 'Unit Price', 'Revenue', 'Profit'];
  const body: (string | number)[][] = [];
  for (let m = 0; m < 12; m++) {
    for (let i = 0; i < 40; i++) {
      const date = `2025-${pad(m + 1)}-${pad(1 + Math.floor(rand() * 28))}`;
      const [region, states] = regions[Math.floor(rand() * regions.length)];
      const state = states[Math.floor(rand() * states.length)];
      const [category, basePrice] = categories[Math.floor(rand() * categories.length)];
      const channel = channels[Math.floor(rand() * channels.length)];
      const seasonal = 1 + 0.35 * Math.sin(((m - 2) / 12) * Math.PI * 2);
      const units = Math.max(1, Math.round((5 + rand() * 30) * seasonal));
      const price = r2(basePrice * (0.85 + rand() * 0.3));
      const revenue = r2(units * price);
      // Some orders lose money, so profit has negatives (useful for waterfalls).
      const profit = r2(revenue * (rand() < 0.12 ? -(0.05 + rand() * 0.2) : 0.08 + rand() * 0.22));
      body.push([date, region, state, category, channel, units, price, revenue, profit]);
    }
  }
  return { name: 'Sample sales 2025', ...buildTable(header, body) };
}

export function sampleStockData(): ParsedTable {
  const rand = rng(7);
  const header = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume'];
  const body: (string | number)[][] = [];
  let price = 182;
  const d = new Date(Date.UTC(2025, 0, 2));
  while (body.length < 120) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const open = price * (1 + (rand() - 0.5) * 0.01);
      const close = open * (1 + (rand() - 0.48) * 0.035);
      const high = Math.max(open, close) * (1 + rand() * 0.012);
      const low = Math.min(open, close) * (1 - rand() * 0.012);
      body.push([d.toISOString().slice(0, 10), r2(open), r2(high), r2(low), r2(close), Math.round(2e6 + rand() * 6e6)]);
      price = close;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return { name: 'Sample stock prices', ...buildTable(header, body) };
}

export function sampleProjectData(): ParsedTable {
  const header = ['Task', 'Team', 'Start', 'End', 'Progress %'];
  const rows: [string, string, string, string, number][] = [
    ['Discovery interviews', 'Research', '2026-09-01', '2026-09-19', 100],
    ['Requirements spec', 'Product', '2026-09-15', '2026-10-03', 100],
    ['Data model design', 'Engineering', '2026-09-29', '2026-10-17', 90],
    ['UI wireframes', 'Design', '2026-10-01', '2026-10-24', 80],
    ['Upload & parsing', 'Engineering', '2026-10-13', '2026-11-07', 70],
    ['Chart library', 'Engineering', '2026-10-20', '2026-11-28', 45],
    ['Visual design', 'Design', '2026-10-27', '2026-11-21', 50],
    ['Usability testing', 'Research', '2026-11-17', '2026-12-05', 10],
    ['Beta launch', 'Product', '2026-12-01', '2026-12-12', 0],
    ['Feedback fixes', 'Engineering', '2026-12-08', '2026-12-31', 0],
  ];
  return { name: 'Sample project plan', ...buildTable(header, rows) };
}

export function sampleStoreData(): ParsedTable {
  const rand = rng(99);
  const cities: [string, string, number, number][] = [
    ['New York', 'United States', 40.71, -74.0],
    ['Chicago', 'United States', 41.88, -87.63],
    ['Austin', 'United States', 30.27, -97.74],
    ['San Francisco', 'United States', 37.77, -122.42],
    ['Toronto', 'Canada', 43.65, -79.38],
    ['Mexico City', 'Mexico', 19.43, -99.13],
    ['São Paulo', 'Brazil', -23.55, -46.63],
    ['London', 'United Kingdom', 51.51, -0.13],
    ['Paris', 'France', 48.86, 2.35],
    ['Berlin', 'Germany', 52.52, 13.4],
    ['Madrid', 'Spain', 40.42, -3.7],
    ['Mumbai', 'India', 19.08, 72.88],
    ['Bengaluru', 'India', 12.97, 77.59],
    ['Singapore', 'Singapore', 1.35, 103.82],
    ['Tokyo', 'Japan', 35.68, 139.69],
    ['Sydney', 'Australia', -33.87, 151.21],
    ['Johannesburg', 'South Africa', -26.2, 28.05],
    ['Dubai', 'United Arab Emirates', 25.2, 55.27],
  ];
  const header = ['Store', 'City', 'Country', 'Latitude', 'Longitude', 'Revenue', 'Visitors', 'Rating'];
  const body = cities.map(([city, country, lat, lon], i) => {
    const visitors = Math.round(8000 + rand() * 40000);
    return [`S-${100 + i}`, city, country, lat, lon, Math.round(visitors * (18 + rand() * 30)), visitors, r2(3.2 + rand() * 1.7)];
  });
  return { name: 'Sample store locations', ...buildTable(header, body) };
}

export function samplePipelineData(): ParsedTable {
  const rand = rng(5);
  const stages: [string, number][] = [
    ['1. Lead', 1],
    ['2. Qualified', 0.55],
    ['3. Demo', 0.34],
    ['4. Proposal', 0.2],
    ['5. Negotiation', 0.12],
    ['6. Won', 0.07],
  ];
  const regions = ['North', 'South', 'East', 'West'];
  const header = ['Stage', 'Region', 'Deals', 'Pipeline Value'];
  const body: (string | number)[][] = [];
  for (const [stage, rate] of stages)
    for (const region of regions) {
      const deals = Math.round(400 * rate * (0.7 + rand() * 0.6));
      body.push([stage, region, deals, Math.round(deals * (9000 + rand() * 6000))]);
    }
  return { name: 'Sample sales pipeline', ...buildTable(header, body) };
}

export interface SampleDef {
  id: string;
  label: string;
  hint: string;
  file: string;
  build: () => ParsedTable;
  /** Charts added with the sample: [type, overrides]. */
  starters: [ChartType, Partial<ChartConfig>?][];
}

export const SAMPLES: SampleDef[] = [
  {
    id: 'sales',
    label: 'Sales orders',
    hint: 'Dates, regions, US states, categories, revenue',
    file: 'sample-sales.csv',
    build: sampleSalesData,
    starters: [
      ['kpi', { title: 'Total revenue', yFields: ['Revenue'] }],
      ['sparkline', { title: 'Monthly revenue', yFields: ['Revenue'] }],
      ['kpi', { title: 'Orders', yFields: [], aggregation: 'count' }],
      ['line', { title: 'Revenue & profit by month', yFields: ['Revenue', 'Profit'] }],
      ['stacked', { title: 'Revenue by region, split by channel', xField: 'Region', groupField: 'Channel', yFields: ['Revenue'] }],
      ['donut', { title: 'Revenue share by category', xField: 'Category', yFields: ['Revenue'] }],
      ['geo', { title: 'Revenue by state', xField: 'State', yFields: ['Revenue'] }],
    ],
  },
  { id: 'stocks', label: 'Stock prices', hint: 'Daily open / high / low / close', file: 'sample-stocks.csv', build: sampleStockData, starters: [['candlestick', { dateBucket: 'day' }]] },
  { id: 'projects', label: 'Project plan', hint: 'Tasks with start and end dates', file: 'sample-projects.csv', build: sampleProjectData, starters: [['gantt']] },
  { id: 'stores', label: 'Store locations', hint: 'Latitude / longitude, countries', file: 'sample-stores.csv', build: sampleStoreData, starters: [['scattermap', { sizeField: 'Revenue' }]] },
  { id: 'pipeline', label: 'Sales pipeline', hint: 'Funnel stages with deal counts', file: 'sample-pipeline.csv', build: samplePipelineData, starters: [['funnel', { yFields: ['Deals'] }]] },
];

export function starterChartsFor(sample: SampleDef, ds: Dataset): ChartConfig[] {
  return sample.starters.map(([type, over]) => {
    const cfg = { ...blankConfig(ds, type), ...over };
    return { ...cfg, title: cfg.title || autoTitle(cfg) };
  });
}
