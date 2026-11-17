import type { CellValue, Column, ColumnType, Row } from '../types';

export type RawCell = string | number | boolean | Date | null | undefined;

const NUMBER_RE = /^[-+]?[$€£₹¥]?\s*[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?\s*%?$/;
const ISO_DATE_RE = /^\d{4}-\d{1,2}-\d{1,2}([T\s]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const SLASH_DATE_RE = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;
const MONTH_NAME_RE = /^(\d{1,2}\s)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,-]+\d{1,4}(,?\s\d{4})?$/i;

function isBlank(v: RawCell): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

export function parseNumber(v: RawCell): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean' || v instanceof Date || isBlank(v)) return null;
  let s = String(v).trim();
  // Accounting-style negatives: (1,234.00)
  const negativeParens = /^\(.*\)$/.test(s);
  if (negativeParens) s = s.slice(1, -1).trim();
  if (!NUMBER_RE.test(s) || !/\d/.test(s)) return null;
  const n = Number(s.replace(/[$€£₹¥,%\s]/g, ''));
  if (!Number.isFinite(n)) return null;
  return negativeParens ? -n : n;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Returns an ISO date (YYYY-MM-DD) or null. */
export function parseDate(v: RawCell): string | null {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!(ISO_DATE_RE.test(s) || SLASH_DATE_RE.test(s) || MONTH_NAME_RE.test(s))) return null;
  if (ISO_DATE_RE.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${pad(m)}-${pad(d)}`;
    return null;
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function inferType(values: RawCell[]): ColumnType {
  const present = values.filter((v) => !isBlank(v));
  if (present.length === 0) return 'string';
  const sample = present.length > 2000 ? present.slice(0, 2000) : present;
  const threshold = Math.ceil(sample.length * 0.95);
  let dates = 0;
  let numbers = 0;
  for (const v of sample) {
    if (v instanceof Date || (typeof v === 'string' && parseDate(v) !== null)) dates++;
    else if (parseNumber(v) !== null) numbers++;
  }
  if (dates >= threshold) return 'date';
  if (numbers >= threshold) return 'number';
  return 'string';
}

function normalise(v: RawCell, type: ColumnType): CellValue {
  if (isBlank(v)) return null;
  if (type === 'number') return parseNumber(v);
  if (type === 'date') return parseDate(v);
  if (v instanceof Date) return parseDate(v);
  return String(v).trim();
}

/** Makes headers non-empty and unique. */
export function cleanHeaders(headers: unknown[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h, i) => {
    let name = h === null || h === undefined ? '' : String(h).trim();
    if (!name) name = `Column ${i + 1}`;
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name} (${count + 1})`;
  });
}

/**
 * Takes a header row + body rows (array-of-arrays), infers a type per column
 * and returns normalised rows: numbers as numbers, dates as ISO strings.
 */
export function buildTable(headerRow: unknown[], body: RawCell[][]): { columns: Column[]; rows: Row[] } {
  const headers = cleanHeaders(headerRow);
  const nonEmpty = body.filter((r) => r.some((c) => !isBlank(c)));
  const columns: Column[] = headers.map((name, i) => ({
    name,
    type: inferType(nonEmpty.map((r) => r[i])),
  }));
  const rows: Row[] = nonEmpty.map((r) => {
    const row: Row = {};
    columns.forEach((c, i) => {
      row[c.name] = normalise(r[i], c.type);
    });
    return row;
  });
  return { columns, rows };
}
