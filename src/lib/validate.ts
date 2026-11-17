import type { Dataset } from '../types';
import { profileDataset } from '../charts/profile';
import { CHART_TYPES } from '../charts/registry';
import { FileReadError, readFile, type ParsedTable } from './parsers';
import { uid } from './id';

/**
 * "Can this file be visualised?" For each table read from a file, a set of
 * checks decides whether it is ready for charts, usable with limits, or not
 * usable, with the reasons spelled out.
 */

export type Verdict = 'ready' | 'limited' | 'unusable';
export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface Check {
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface TableReport {
  dataset: Dataset;
  verdict: Verdict;
  checks: Check[];
  /** Names of the chart types that fit best. */
  bestFits: string[];
}

export interface FileReport {
  id: string;
  fileName: string;
  size: number;
  format: string | null;
  verdict: Verdict;
  /** Why the file couldn't be read at all. */
  error?: { message: string; kind?: string };
  notes: string[];
  tables: TableReport[];
}

export function toDataset(t: ParsedTable, fileName: string): Dataset {
  return { id: uid('d_'), name: t.name, fileName, columns: t.columns, rows: t.rows, createdAt: Date.now() };
}

const list = (names: string[], max = 3) => names.slice(0, max).join(', ') + (names.length > max ? ` +${names.length - max} more` : '');
const plural = (n: number, w: string) => `${n.toLocaleString()} ${w}${n === 1 ? '' : 's'}`;

export function validateTable(ds: Dataset): TableReport {
  const p = profileDataset(ds);
  const checks: Check[] = [];

  // 1. Rows
  if (p.rows === 0) checks.push({ label: 'Data rows', status: 'fail', detail: 'No rows of data.' });
  else if (p.rows < 3) checks.push({ label: 'Data rows', status: 'warn', detail: `Only ${plural(p.rows, 'row')}; most charts need more to show a pattern.` });
  else checks.push({ label: 'Data rows', status: 'pass', detail: plural(p.rows, 'row') });

  // 2. Columns / structure
  const counts = { number: 0, date: 0, string: 0 };
  ds.columns.forEach((c) => counts[c.type]++);
  checks.push({
    label: 'Columns',
    status: ds.columns.length ? 'pass' : 'fail',
    detail: ds.columns.length ? `${plural(ds.columns.length, 'column')}: ${counts.number} numeric, ${counts.date} date, ${counts.string} text` : 'No columns found.',
  });

  // 3. Completeness
  const cells = p.rows * ds.columns.length;
  const filled = p.columns.reduce((s, c) => s + c.nonNull, 0);
  const emptyShare = cells ? 1 - filled / cells : 1;
  const blankCols = p.columns.filter((c) => c.nonNull === 0).map((c) => c.name);
  if (emptyShare > 0.6) checks.push({ label: 'Completeness', status: 'warn', detail: `${Math.round(emptyShare * 100)}% of cells are empty; charts may look sparse.` });
  else checks.push({ label: 'Completeness', status: 'pass', detail: blankCols.length ? `${Math.round((1 - emptyShare) * 100)}% filled; empty columns: ${list(blankCols)}` : `${Math.round((1 - emptyShare) * 100)}% of cells filled` });

  // 4. Something to measure
  const numeric = p.columns.filter((c) => c.type === 'number' && c.nonNull > 0);
  if (p.measures.length) checks.push({ label: 'Values to measure', status: 'pass', detail: list(p.measures.map((m) => m.name)) });
  else if (numeric.length) checks.push({ label: 'Values to measure', status: 'warn', detail: `Only ID-like or coordinate numbers (${list(numeric.map((m) => m.name))}); charts will mostly count rows.` });
  else checks.push({ label: 'Values to measure', status: 'warn', detail: 'No numeric columns; charts can only count rows per group.' });

  // 5. Something to group by
  const groups = [...p.categories.map((c) => c.name), ...p.dates.map((d) => d.name)];
  if (groups.length) checks.push({ label: 'Columns to group by', status: 'pass', detail: list(groups) });
  else if (p.labels.length) checks.push({ label: 'Columns to group by', status: 'warn', detail: `Text columns (${list(p.labels.map((l) => l.name))}) have too many distinct values to group by.` });
  else checks.push({ label: 'Columns to group by', status: 'warn', detail: 'No category or date columns; only distribution and correlation charts apply.' });

  // 6. Chart fit, using the same rules as the chart picker
  const fits = CHART_TYPES.map((d) => ({ name: d.name, s: d.suggest(p) }));
  const good = fits.filter((f) => f.s.level === 'good').sort((a, b) => b.s.score - a.s.score);
  const possible = fits.filter((f) => f.s.level === 'possible');
  if (p.rows === 0 || (!good.length && !possible.length)) checks.push({ label: 'Chart types that fit', status: 'fail', detail: 'None of the chart types can use this data.' });
  else if (good.length >= 3) checks.push({ label: 'Chart types that fit', status: 'pass', detail: `${good.length} good fits, ${possible.length} possible` });
  else checks.push({ label: 'Chart types that fit', status: 'warn', detail: `${good.length} good fit${good.length === 1 ? '' : 's'}, ${possible.length} possible; options are limited.` });

  const verdict: Verdict = checks.some((c) => c.status === 'fail') ? 'unusable' : checks.some((c) => c.status === 'warn') ? 'limited' : 'ready';
  return { dataset: ds, verdict, checks, bestFits: good.slice(0, 4).map((f) => f.name) };
}

const RANK: Record<Verdict, number> = { ready: 2, limited: 1, unusable: 0 };

/** Reads a file and checks every table in it. Never throws: failures become an "unusable" report. */
export async function checkFile(file: File): Promise<FileReport> {
  const base = { id: uid('f_'), fileName: file.name, size: file.size };
  try {
    const { tables, format } = await readFile(file);
    const notes = tables.flatMap((t) => t.notes ?? []);
    const nested = tables.filter((t) => t.name.includes(' › '));
    if (nested.length) notes.push(`Nested lists became linked tables: ${nested.map((t) => t.name.split(' › ').slice(1).join(' › ')).join(', ')}.`);
    const reports = tables.map((t) => validateTable(toDataset(t, file.name)));
    const verdict = reports.reduce<Verdict>((best, r) => (RANK[r.verdict] > RANK[best] ? r.verdict : best), 'unusable');
    return { ...base, format, verdict, notes, tables: reports };
  } catch (e) {
    return { ...base, format: e instanceof FileReadError ? (e.kind ?? null) : null, verdict: 'unusable', error: { message: (e as Error).message, kind: e instanceof FileReadError ? e.kind : undefined }, notes: [], tables: [] };
  }
}
