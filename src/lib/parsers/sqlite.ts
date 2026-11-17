import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { buildTable, type RawCell } from '../infer';
import type { ParsedTable } from './index';

/** SQLite database (.db / .sqlite) → one table per table or view, read in-browser with sql.js. */

const MAX_ROWS = 200_000;
const MAX_TABLES = 40;
const MAGIC = 'SQLite format 3\u0000';

export function isSqlite(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  for (let i = 0; i < 16; i++) if (bytes[i] !== MAGIC.charCodeAt(i)) return false;
  return true;
}

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

export async function parseSqlite(file: File): Promise<ParsedTable[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isSqlite(bytes)) {
    throw new Error('This file isn’t a SQLite database. Only SQLite .db files can be opened in the browser; export the tables as CSV from the application that created it.');
  }
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  let db: InstanceType<typeof SQL.Database>;
  try {
    db = new SQL.Database(bytes);
  } catch (e) {
    throw new Error(`The database couldn’t be opened: ${(e as Error).message}`);
  }
  try {
    let list: { name: string; type: string }[];
    try {
      const res = db.exec("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type = 'view', name");
      list = (res[0]?.values ?? []).map(([name, type]) => ({ name: String(name), type: String(type) }));
    } catch (e) {
      throw new Error(`The database couldn’t be read (it may be encrypted or damaged): ${(e as Error).message}`);
    }
    if (!list.length) throw new Error('The database has no tables.');
    const notes: string[] = [];
    if (list.length > MAX_TABLES) {
      notes.push(`Read the first ${MAX_TABLES} of ${list.length} tables.`);
      list = list.slice(0, MAX_TABLES);
    }
    const base = file.name.replace(/\.[^.]+$/, '');
    const empty: string[] = [];
    const tables: ParsedTable[] = [];
    for (const { name, type } of list) {
      let count = 0;
      try {
        count = Number(db.exec(`SELECT COUNT(*) FROM ${quoteIdent(name)}`)[0]?.values[0][0] ?? 0);
      } catch {
        notes.push(`Skipped ${type} “${name}”: it couldn’t be queried.`);
        continue;
      }
      if (!count) {
        empty.push(name);
        continue;
      }
      const res = db.exec(`SELECT * FROM ${quoteIdent(name)} LIMIT ${MAX_ROWS}`)[0];
      if (!res) continue;
      const body = res.values.map((row) => row.map((v) => (v instanceof Uint8Array ? '[binary]' : (v as RawCell))));
      if (count > MAX_ROWS) notes.push(`“${name}” has ${count.toLocaleString()} rows; read the first ${MAX_ROWS.toLocaleString()}.`);
      tables.push({ name: `${base} · ${name}${type === 'view' ? ' (view)' : ''}`, ...buildTable(res.columns, body) });
    }
    if (empty.length) notes.push(`Empty tables skipped: ${empty.slice(0, 6).join(', ')}${empty.length > 6 ? '…' : ''}.`);
    if (!tables.length) throw new Error(`All ${list.length} tables in the database are empty.`);
    if (notes.length) tables[0].notes = notes;
    return tables;
  } finally {
    db.close();
  }
}
