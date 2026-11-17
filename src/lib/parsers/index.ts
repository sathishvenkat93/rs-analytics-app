import type { Column, Row } from '../../types';
import { parseCsv } from './csv';

/** One table extracted from a file. Spreadsheets can yield one per sheet. */
export interface ParsedTable {
  name: string;
  columns: Column[];
  rows: Row[];
}

export interface FileParser {
  extensions: string[];
  label: string;
  parse: (file: File) => Promise<ParsedTable[]>;
}

/**
 * Parser registry. To add a format, implement FileParser and register it here.
 * Phase 2: add JSON / JSONL parsers (flatten nested objects into dotted
 * column names, e.g. `customer.region`, and expand arrays of records).
 */
const PARSERS: FileParser[] = [
  { extensions: ['csv', 'tsv', 'txt'], label: 'CSV', parse: parseCsv },
  // SheetJS is large, so it's only downloaded when an Excel file is opened.
  { extensions: ['xlsx', 'xls', 'xlsm'], label: 'Excel', parse: (f) => import('./xlsx').then((m) => m.parseXlsx(f)) },
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
  if (!parser) {
    const hint = ext === 'json' || ext === 'jsonl' ? ' JSON and JSONL support is planned for Phase 2.' : '';
    throw new Error(`“.${ext || '?'}” files aren't supported yet. Upload a CSV or Excel file.${hint}`);
  }
  const tables = await parser.parse(file);
  const usable = tables.filter((t) => t.rows.length > 0 && t.columns.length > 0);
  if (usable.length === 0) throw new Error(`No rows found in ${file.name}. Check that the first row holds column headers.`);
  return usable;
}
