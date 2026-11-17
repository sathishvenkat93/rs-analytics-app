import { COUNTRY_ALIASES, COUNTRY_NAMES, US_STATE_ABBR, US_STATE_NAMES } from './geoNames';

const countryByLower = new Map(COUNTRY_NAMES.map((n) => [n.toLowerCase(), n]));
const stateByLower = new Map(US_STATE_NAMES.map((n) => [n.toLowerCase(), n]));

/** Maps a cell value to the atlas country name, or null. */
export function resolveCountry(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const k = v.trim().toLowerCase();
  if (!k) return null;
  return countryByLower.get(k) ?? COUNTRY_ALIASES[k] ?? null;
}

/** Maps a cell value (full name or postal code) to the atlas US state name, or null. */
export function resolveState(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return stateByLower.get(s.toLowerCase()) ?? US_STATE_ABBR[s.toUpperCase()] ?? null;
}

export type GeoScope = 'world' | 'usa';

/** Share of distinct values that resolve, for each scope. */
export function geoMatchRate(values: string[]): { scope: GeoScope; rate: number } {
  if (values.length === 0) return { scope: 'world', rate: 0 };
  const states = values.filter((v) => resolveState(v)).length / values.length;
  const countries = values.filter((v) => resolveCountry(v)).length / values.length;
  return states > countries ? { scope: 'usa', rate: states } : { scope: 'world', rate: countries };
}
