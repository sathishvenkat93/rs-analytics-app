import type { Column, Row } from '../../types';
import { parseCsv } from './csv';
import { parseJson, parseJsonLines } from './json';

/** One table extracted from a file. Spreadsheets can yield one per sheet. */
export interface ParsedTable {
  name: string;
  columns: Column[];
  rows: Row[];
  /** Things the user should know about how the file was read (skipped lines, nested lists…). */
  notes?: string[];
}

export interface FileParser {
  extensions: string[];
  label: string;
  parse: (file: File) => Promise<ParsedTable[]>;
}

/** Parser registry. To add a format, implement FileParser and register it here. */
const PARSERS: FileParser[] = [
  { extensions: ['csv', 'tsv', 'txt'], label: 'CSV', parse: parseCsv },
  // SheetJS is large, so it's only downloaded when an Excel file is opened.
  { extensions: ['xlsx', 'xls', 'xlsm'], label: 'Excel', parse: (f) => import('./xlsx').then((m) => m.parseXlsx(f)) },
  { extensions: ['json', 'geojson'], label: 'JSON', parse: parseJson },
  { extensions: ['jsonl', 'ndjson'], label: 'JSON Lines', parse: parseJsonLines },
];

export const SUPPORTED_EXTENSIONS = PARSERS.flatMap((p) => p.extensions);
export const ACCEPT_ATTR = SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(',');

export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i === -1 ? '' : fileName.slice(i + 1).toLowerCase();
}

export async function parseFile(file: File): Promise<ParsedTable[]> {
  const ext = extensionOf(file.name);
  const parser = PARSERS.find((p) => p.extensions.includes(ext));
  if (!parser) throw new Error(`“.${ext || '?'}” files aren't supported. Upload a CSV, Excel, JSON or JSONL file.`);
  const tables = await parser.parse(file);
  const usable = tables.filter((t) => t.rows.length > 0 && t.columns.length > 0);
  if (usable.length === 0) throw new Error(`No rows found in ${file.name}.${parser.label === 'CSV' || parser.label === 'Excel' ? ' Check that the first row holds column headers.' : ''}`);
  // Keep notes even if the table that carried them was dropped as empty.
  const notes = tables.flatMap((t) => t.notes ?? []);
  if (notes.length) usable[0] = { ...usable[0], notes };
  return usable;
}
