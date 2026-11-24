import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { Dataset } from '../types';

/**
 * SQL over the loaded datasets: each dataset becomes a table in an in-memory
 * SQLite database (sql.js). Queries run on this copy only; the datasets
 * themselves are never modified.
 */

export interface QueryTable {
  name: string;
  datasetId: string;
  datasetName: string;
  fileName: string;
  rows: number;
  columns: { name: string; type: string }[];
}

export interface QueryResult {
  columns: string[];
  rows: (string | number | null)[][];
  ms: number;
  /** Statements that ran but returned no rows (e.g. CREATE TEMP TABLE). */
  silentStatements: number;
}

let engine: Promise<SqlJsStatic> | null = null;
const getEngine = () => (engine ??= initSqlJs({ locateFile: () => wasmUrl }));

const quote = (id: string) => `"${id.replace(/"/g, '""')}"`;

/** A short, SQL-friendly table name from a dataset name: "Sample sales 2025" → sample_sales_2025. */
export function tableNameFor(name: string, taken: Set<string>): string {
  let base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'data';
  if (/^\d/.test(base)) base = `t_${base}`;
  let n = base;
  for (let i = 2; taken.has(n); i++) n = `${base}_${i}`;
  taken.add(n);
  return n;
}

export async function buildQueryDb(datasets: Dataset[]): Promise<{ db: Database; tables: QueryTable[] }> {
  const SQL = await getEngine();
  const db = new SQL.Database();
  const taken = new Set<string>();
  const tables: QueryTable[] = [];
  db.run('BEGIN');
  try {
    for (const ds of datasets) {
      const name = tableNameFor(ds.name, taken);
      const cols = ds.columns.map((c) => `${quote(c.name)} ${c.type === 'number' ? 'REAL' : 'TEXT'}`);
      db.run(`CREATE TABLE ${quote(name)} (${cols.join(', ')})`);
      if (ds.rows.length && ds.columns.length) {
        const stmt = db.prepare(`INSERT INTO ${quote(name)} VALUES (${ds.columns.map(() => '?').join(', ')})`);
        for (const r of ds.rows) stmt.run(ds.columns.map((c) => r[c.name] ?? null));
        stmt.free();
      }
      tables.push({ name, datasetId: ds.id, datasetName: ds.name, fileName: ds.fileName, rows: ds.rows.length, columns: ds.columns.map((c) => ({ name: c.name, type: c.type })) });
    }
    db.run('COMMIT');
  } catch (e) {
    db.close();
    throw e;
  }
  return { db, tables };
}

export function runQuery(db: Database, sql: string): QueryResult {
  const t0 = performance.now();
  const results = db.exec(sql);
  const ms = Math.round(performance.now() - t0);
  const last = results[results.length - 1];
  if (!last) return { columns: [], rows: [], ms, silentStatements: 1 };
  const rows = last.values.map((r) => r.map((v) => (v instanceof Uint8Array ? '[binary]' : (v as string | number | null))));
  return { columns: last.columns, rows, ms, silentStatements: 0 };
}
