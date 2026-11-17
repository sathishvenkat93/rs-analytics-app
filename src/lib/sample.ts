import { buildTable } from './infer';
import type { ParsedTable } from './parsers';

/** Deterministic demo sales data so the app can be tried without a file. */
export function sampleSalesData(): ParsedTable {
  let seed = 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const regions = ['North', 'South', 'East', 'West'];
  const categories: [string, number][] = [
    ['Electronics', 420], ['Furniture', 260], ['Office Supplies', 45], ['Clothing', 70], ['Groceries', 25],
  ];
  const channels = ['Online', 'Retail', 'Wholesale'];
  const header = ['Order Date', 'Region', 'Category', 'Channel', 'Units', 'Unit Price', 'Revenue', 'Profit'];
  const body: (string | number)[][] = [];
  for (let m = 0; m < 12; m++) {
    for (let i = 0; i < 40; i++) {
      const day = 1 + Math.floor(rand() * 28);
      const date = `2025-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const region = regions[Math.floor(rand() * regions.length)];
      const [category, basePrice] = categories[Math.floor(rand() * categories.length)];
      const channel = channels[Math.floor(rand() * channels.length)];
      const seasonal = 1 + 0.35 * Math.sin(((m - 2) / 12) * Math.PI * 2);
      const units = Math.max(1, Math.round((5 + rand() * 30) * seasonal));
      const price = Math.round(basePrice * (0.85 + rand() * 0.3) * 100) / 100;
      const revenue = Math.round(units * price * 100) / 100;
      const profit = Math.round(revenue * (0.08 + rand() * 0.22) * 100) / 100;
      body.push([date, region, category, channel, units, price, revenue, profit]);
    }
  }
  const { columns, rows } = buildTable(header, body);
  return { name: 'Sample sales 2025', columns, rows };
}
