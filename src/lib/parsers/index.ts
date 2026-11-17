import type { Column, Row } from '../../types';
import { parseCsv, parseTsv } from './csv';
import { parseJson, parseJsonLines } from './json';
import { sniffFile } from './sniff';

/** One table extracted from a file. Spreadsheets and databases can yield several. */
export interface ParsedTable {
  name: string;
  columns: Column[];
  rows: Row[];
  /** Things the user should know about how the file was read (skipped lines, nested lists…). */
  notes?: string[];
}

type FormatId = 'csv' | 'tsv' | 'xlsx' | 'json' | 'jsonl' | 'xml' | 'sql' | 'sqlite';

export interface FileParser {
  id: FormatId;
  extensions: string[];
  label: string;
  /**
   * Whether files of this format go through the "can this be visualised?"
   * check before they're added. CSV and Excel are already tabular, so they
   * load directly.
   */
  validate: boolean;
  parse: (file: File) => Promise<ParsedTable[]>;
}

/** Parser registry. To add a format, implement FileParser and register it here. */
const PARSERS: FileParser[] = [
  { id: 'csv', extensions: ['csv'], label: 'CSV', validate: false, parse: parseCsv },
  // SheetJS, the XML/SQL readers and the SQLite engine are only downloaded when needed.
  { id: 'xlsx', extensions: ['xlsx', 'xls', 'xlsm'], label: 'Excel', validate: false, parse: (f) => import('./xlsx').then((m) => m.parseXlsx(f)) },
  { id: 'tsv', extensions: ['tsv', 'tab'], label: 'TSV', validate: true, parse: parseTsv },
  { id: 'json', extensions: ['json', 'geojson'], label: 'JSON', validate: true, parse: parseJson },
  { id: 'jsonl', extensions: ['jsonl', 'ndjson'], label: 'JSON Lines', validate: true, parse: parseJsonLines },
  { id: 'xml', extensions: ['xml'], label: 'XML', validate: true, parse: (f) => import('./xml').then((m) => m.parseXml(f)) },
  { id: 'sql', extensions: ['sql'], label: 'SQL dump', validate: true, parse: (f) => import('./sql').then((m) => m.parseSql(f)) },
  { id: 'sqlite', extensions: ['db', 'sqlite', 'sqlite3', 'db3'], label: 'SQLite database', validate: true, parse: (f) => import('./sqlite').then((m) => m.parseSqlite(f)) },
];

export const SUPPORTED_EXTENSIONS = PARSERS.flatMap((p) => p.extensions);
export const ACCEPT_ATTR = [...SUPPORTED_EXTENSIONS, 'txt'].map((e) => `.${e}`).join(',');
const MAX_BYTES = 300 * 1024 * 1024;

export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i === -1 ? '' : fileName.slice(i + 1).toLowerCase();
}

const byExt = (ext: string) => PARSERS.find((p) => p.extensions.includes(ext));
const byId = (id: FormatId) => PARSERS.find((p) => p.id === id)!;

/** CSV and Excel load straight away; every other file is checked first. */
export function needsValidation(fileName: string): boolean {
  return byExt(extensionOf(fileName))?.validate ?? true;
}

/** A file that was read but can't provide data, with a short label for what it is. */
export class FileReadError extends Error {
  kind?: string;
  constructor(message: string, kind?: string) {
    super(message);
    this.kind = kind;
  }
}

export interface ReadResult {
  tables: ParsedTable[];
  /** Human label of the format used to read the file. */
  format: string;
  /** Set when the format came from the file's contents rather than its extension. */
  detected?: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function readFile(file: File): Promise<ReadResult> {
  if (file.size > MAX_BYTES) throw new FileReadError(`The file is ${Math.round(file.size / 1048576)} MB; files over ${MAX_BYTES / 1048576} MB are too large to load in the browser.`, 'Too large');
  const ext = extensionOf(file.name);
  let parser = byExt(ext);
  let detected: string | undefined;

  // Unknown extension, or a .db that isn't really SQLite: decide from the contents.
  const dbSniff = parser?.id === 'sqlite' ? await sniffFile(file) : null;
  const dbMismatch = dbSniff !== null && !('format' in dbSniff && dbSniff.format === 'sqlite');
  if (!parser || dbMismatch) {
    const s = dbSniff ?? (await sniffFile(file));
    if ('reject' in s) throw new FileReadError((dbMismatch ? `This .${ext} file isn’t a SQLite database. ` : '') + s.reject, s.label);
    parser = byId(s.format);
    detected = ext ? `Read as ${s.label} based on its contents (“.${ext}” ${dbMismatch ? 'didn’t match' : 'isn’t a recognised data extension'}).` : `Read as ${s.label} based on its contents.`;
  }

  let tables: ParsedTable[];
  try {
    tables = await parser.parse(file);
  } catch (e) {
    throw new FileReadError((e as Error).message.replace(new RegExp(`^${escapeRe(file.name)}:?\\s*`), ''), parser.label);
  }
  const usable = tables.filter((t) => t.rows.length > 0 && t.columns.length > 0);
  if (usable.length === 0) throw new FileReadError(`No data rows were found.${parser.id === 'csv' || parser.id === 'xlsx' ? ' Check that the first row holds column headers.' : ''}`, parser.label);
  // Keep notes even if the table that carried them was dropped as empty.
  const notes = [...(detected ? [detected] : []), ...tables.flatMap((t) => t.notes ?? [])];
  usable[0] = { ...usable[0], notes: notes.length ? notes : undefined };
  return { tables: usable, format: parser.label, detected };
}

/** Direct path for CSV/Excel: just the tables. */
export async function parseFile(file: File): Promise<ParsedTable[]> {
  try {
    return (await readFile(file)).tables;
  } catch (e) {
    throw new Error(`${file.name}: ${(e as Error).message}`);
  }
}
