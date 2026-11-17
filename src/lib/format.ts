const full = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

export function formatValue(n: number): string {
  return full.format(n);
}

/** Hero / tile values: 1,284 · 12.9K · 4.2M */
export function formatCompact(n: number): string {
  return Math.abs(n) >= 10_000 ? compact.format(n) : full.format(n);
}

/** Axis ticks: full under 10,000, compact above — one style per axis. */
export function axisFormatter(maxAbs: number): (n: number) => string {
  return maxAbs >= 10_000 ? (n) => compact.format(n) : (n) => full.format(n);
}

export function formatPercent(part: number, whole: number): string {
  if (!whole) return '0%';
  const p = (part / whole) * 100;
  return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
