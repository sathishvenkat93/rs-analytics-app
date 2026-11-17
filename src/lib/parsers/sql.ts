import { buildTable, type RawCell } from '../infer';
import type { ParsedTable } from './index';

/**
 * SQL dump (.sql) → tables, without running SQL.
 *
 * Reads the data a dump carries:
 * - `INSERT [IGNORE|OR REPLACE] INTO t (cols) VALUES (...), (...);` and `REPLACE INTO`
 * - Postgres `COPY t (cols) FROM stdin;` blocks (tab-separated, ended by `\.`)
 * Column names come from the INSERT column list, else from `CREATE TABLE`.
 * Works across MySQL, Postgres, SQLite and SQL Server dumps: quoted
 * identifiers (`x`, "x", [x]), '' and backslash escapes, comments, dollar quotes.
 */

const MAX_ROWS_PER_TABLE = 500_000;

interface TableAcc {
  name: string;
  columns: string[];
  rows: Record<string, RawCell>[];
  truncated: boolean;
}

/* ---------- statement splitting ---------- */

interface Statement {
  sql: string;
  /** Data lines that followed a `COPY … FROM stdin;` statement. */
  copyData?: string[];
}

function splitStatements(text: string): Statement[] {
  const out: Statement[] = [];
  let start = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '-' && next === '-') {
      i = text.indexOf('\n', i);
      if (i === -1) i = n;
      continue;
    }
    // SQL Server batch separator: a line holding only GO.
    if ((c === 'G' || c === 'g') && (i === 0 || text[i - 1] === '\n') && /^GO[ \t]*(\r?\n|$)/i.test(text.slice(i, i + 6))) {
      const sql = stripLeadingComments(text.slice(start, i));
      if (sql) out.push({ sql });
      i += 2;
      start = i;
      continue;
    }
    if (c === '#' && (i === 0 || text[i - 1] === '\n')) {
      i = text.indexOf('\n', i);
      if (i === -1) i = n;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      i = skipQuoted(text, i, c);
      continue;
    }
    if (c === '[') {
      const end = text.indexOf(']', i);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (c === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(text.slice(i, i + 40));
      if (m) {
        const end = text.indexOf(m[0], i + m[0].length);
        i = end === -1 ? n : end + m[0].length;
        continue;
      }
    }
    if (c === ';') {
      const sql = stripLeadingComments(text.slice(start, i));
      i++;
      if (/^COPY\s[\s\S]*FROM\s+stdin/i.test(sql)) {
        // Data lines follow until a line holding only "\."
        const lines: string[] = [];
        let lineStart = text.indexOf('\n', i) + 1 || n;
        while (lineStart < n) {
          let lineEnd = text.indexOf('\n', lineStart);
          if (lineEnd === -1) lineEnd = n;
          const line = text.slice(lineStart, lineEnd).replace(/\r$/, '');
          lineStart = lineEnd + 1;
          if (line === '\\.') break;
          lines.push(line);
        }
        out.push({ sql, copyData: lines });
        i = lineStart;
      } else if (sql) out.push({ sql });
      start = i;
      continue;
    }
    i++;
  }
  const tail = stripLeadingComments(text.slice(start));
  if (tail) out.push({ sql: tail });
  return out;
}

/** Index just past a quoted run starting at `i`. Handles doubled quotes and backslash escapes. */
function skipQuoted(text: string, i: number, q: string): number {
  let j = i + 1;
  while (j < text.length) {
    const c = text[j];
    if (c === '\\' && q !== '`') {
      j += 2;
      continue;
    }
    if (c === q) {
      if (text[j + 1] === q) {
        j += 2;
        continue;
      }
      return j + 1;
    }
    j++;
  }
  return text.length;
}

function stripLeadingComments(s: string): string {
  let t = s.trim();
  for (;;) {
    if (t.startsWith('--')) t = t.slice((t.indexOf('\n') + 1 || t.length) as number).trim();
    else if (t.startsWith('/*')) {
      const e = t.indexOf('*/');
      t = e === -1 ? '' : t.slice(e + 2).trim();
    } else return t;
  }
}

/* ---------- identifiers ---------- */

const IDENT = '(?:`[^`]+`|"[^"]+"|\\[[^\\]]+\\]|[\\w$]+)';
const QUALIFIED = `(${IDENT}(?:\\s*\\.\\s*${IDENT})*)`;

function unquote(id: string): string {
  const t = id.trim();
  if ((t.startsWith('`') && t.endsWith('`')) || (t.startsWith('"') && t.endsWith('"')) || (t.startsWith('[') && t.endsWith(']'))) return t.slice(1, -1);
  return t;
}

/** `public."Orders"` → `Orders`. */
function tableIdent(q: string): string {
  const parts = q.match(new RegExp(IDENT, 'g')) ?? [q];
  return unquote(parts[parts.length - 1]);
}

function columnList(s: string | undefined): string[] | null {
  if (!s) return null;
  const inner = s.trim().replace(/^\(/, '').replace(/\)$/, '');
  return splitTopLevel(inner).map((c) => unquote(c.trim())).filter(Boolean);
}

/* ---------- value parsing ---------- */

/** Splits on commas that aren't inside quotes or parentheses. */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipQuoted(s, i, c) - 1;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

function readString(s: string, i: number, backslashEscapes: boolean): [string, number] {
  let out = '';
  let j = i + 1;
  while (j < s.length) {
    const c = s[j];
    if (c === '\\' && backslashEscapes) {
      const e = s[j + 1];
      out += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e === '0' ? '' : e === 'Z' ? '' : e;
      j += 2;
      continue;
    }
    if (c === "'") {
      if (s[j + 1] === "'") {
        out += "'";
        j += 2;
        continue;
      }
      return [out, j + 1];
    }
    out += c;
    j++;
  }
  return [out, j];
}

/** Parses `(v, v, …), (v, …)` starting at `i`. Returns the tuples. */
function parseTuples(s: string, i: number, backslashEscapes: boolean): { tuples: RawCell[][]; end: number } {
  const tuples: RawCell[][] = [];
  const n = s.length;
  const ws = () => {
    while (i < n && /\s/.test(s[i])) i++;
  };
  for (;;) {
    ws();
    if (s[i] !== '(') break;
    i++;
    const tuple: RawCell[] = [];
    for (;;) {
      ws();
      let c = s[i];
      // Prefixed strings: E'…' (Postgres), N'…' (SQL Server), _utf8'…' (MySQL)
      const prefix = /^(?:[EeNn]|_\w+)'/.exec(s.slice(i, i + 12));
      if (prefix) {
        i += prefix[0].length - 1;
        c = "'";
      }
      if (c === "'") {
        const [str, j] = readString(s, i, backslashEscapes || !!prefix?.[0].match(/^[Ee]'/));
        tuple.push(str);
        i = j;
        // Postgres casts after a literal: '2025-01-01'::date, 'x'::character varying
        while (s.startsWith('::', i)) {
          i += 2;
          while (i < n && s[i] !== ',' && s[i] !== ')') i++;
        }
      } else if (/^[Xx]'/.test(s.slice(i, i + 2)) || /^0x[0-9a-f]/i.test(s.slice(i, i + 3))) {
        tuple.push('[binary]');
        while (i < n && s[i] !== ',' && s[i] !== ')') i += s[i] === "'" ? skipQuoted(s, i, "'") - i : 1;
      } else {
        // Bare token: number, NULL, TRUE/FALSE, or an expression like NOW() / CAST(...)
        let depth = 0;
        const start = i;
        while (i < n) {
          const ch = s[i];
          if (ch === "'") {
            i = skipQuoted(s, i, "'");
            continue;
          }
          if (ch === '(') depth++;
          else if (ch === ')') {
            if (depth === 0) break;
            depth--;
          } else if (ch === ',' && depth === 0) break;
          i++;
        }
        const tok = s.slice(start, i).trim();
        if (/^null$/i.test(tok)) tuple.push(null);
        else if (/^true$/i.test(tok)) tuple.push('true');
        else if (/^false$/i.test(tok)) tuple.push('false');
        else if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(tok)) tuple.push(Number(tok));
        else tuple.push(tok.replace(/::\w+(\[\])?$/, ''));
      }
      ws();
      if (s[i] === ',') {
        i++;
        continue;
      }
      if (s[i] === ')') {
        i++;
        break;
      }
      return { tuples, end: i }; // malformed; keep what we have
    }
    tuples.push(tuple);
    ws();
    if (s[i] === ',') {
      i++;
      continue;
    }
    break;
  }
  return { tuples, end: i };
}

function unescapeCopy(v: string): RawCell {
  if (v === '\\N') return null;
  return v.replace(/\\(.)/g, (_, e: string) => (e === 't' ? '\t' : e === 'n' ? '\n' : e === 'r' ? '\r' : e));
}

/* ---------- main ---------- */

const CREATE_RE = new RegExp(`^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:(?:GLOBAL|LOCAL)\\s+)?(?:TEMP(?:ORARY)?\\s+|UNLOGGED\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${QUALIFIED}\\s*\\(`, 'i');
const INSERT_RE = new RegExp(`^(?:INSERT|REPLACE)\\s+(?:(?:OR\\s+\\w+|IGNORE|LOW_PRIORITY|DELAYED|HIGH_PRIORITY)\\s+)*INTO\\s+${QUALIFIED}\\s*(\\([^)]*\\))?\\s*(?:OVERRIDING\\s+\\w+\\s+VALUE\\s+)?VALUES\\s*`, 'i');
const INSERT_SELECT_RE = /^(?:INSERT|REPLACE)\s[\s\S]*?\bSELECT\b/i;
const COPY_RE = new RegExp(`^COPY\\s+${QUALIFIED}\\s*(\\([^)]*\\))?\\s+FROM\\s+stdin`, 'i');
const CONSTRAINT_RE = /^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN|CHECK|FULLTEXT|SPATIAL|EXCLUDE|PERIOD|LIKE)\b/i;

function createColumns(stmt: string, openIdx: number): string[] {
  // Body between the opening paren and its match.
  let depth = 0;
  let end = stmt.length;
  for (let i = openIdx; i < stmt.length; i++) {
    const c = stmt[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipQuoted(stmt, i, c) - 1;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) {
      end = i;
      break;
    }
  }
  return splitTopLevel(stmt.slice(openIdx + 1, end))
    .map((d) => d.trim())
    .filter((d) => d && !CONSTRAINT_RE.test(d))
    .map((d) => unquote((d.match(new RegExp(`^${IDENT}`)) ?? [d.split(/\s+/)[0]])[0]));
}

export function tablesFromSql(text: string, base: string): { tables: ParsedTable[]; notes: string[] } {
  const statements = splitStatements(text.replace(/^\uFEFF/, ''));
  const mysqlStyle = /`|ENGINE\s*=|\/\*!\d+/i.test(text.slice(0, 200_000));
  const schema = new Map<string, string[]>();
  const tables = new Map<string, TableAcc>();
  let other = 0;
  let insertSelect = 0;
  let queries = 0;

  const acc = (name: string): TableAcc => {
    let t = tables.get(name);
    if (!t) tables.set(name, (t = { name, columns: [], rows: [], truncated: false }));
    return t;
  };
  const addRows = (name: string, cols: string[] | null, tuples: RawCell[][]) => {
    const t = acc(name);
    for (const tuple of tuples) {
      if (t.rows.length >= MAX_ROWS_PER_TABLE) {
        t.truncated = true;
        return;
      }
      const known = cols ?? schema.get(name);
      const names = known && known.length >= tuple.length ? known : tuple.map((_, i) => known?.[i] ?? `Column ${i + 1}`);
      const row: Record<string, RawCell> = {};
      tuple.forEach((v, i) => {
        if (!t.columns.includes(names[i])) t.columns.push(names[i]);
        row[names[i]] = v;
      });
      t.rows.push(row);
    }
  };

  for (const st of statements) {
    const sql = st.sql;
    let m: RegExpExecArray | null;
    if ((m = CREATE_RE.exec(sql))) {
      schema.set(tableIdent(m[1]), createColumns(sql, m[0].length - 1));
    } else if ((m = INSERT_RE.exec(sql))) {
      // Scripts without semicolons (common from SQL Server) chain INSERTs in one "statement".
      let rest = sql;
      while (m) {
        const { tuples, end } = parseTuples(rest, m[0].length, mysqlStyle);
        addRows(tableIdent(m[1]), columnList(m[2]), tuples);
        rest = rest.slice(end).replace(/^\s*ON\s+(DUPLICATE\s+KEY\s+UPDATE|CONFLICT)[\s\S]*?(?=\n\s*(INSERT|REPLACE)\s|$)/i, '').trimStart();
        m = INSERT_RE.exec(rest);
      }
    } else if (INSERT_SELECT_RE.test(sql)) {
      insertSelect++;
    } else if ((m = COPY_RE.exec(sql)) && st.copyData) {
      const cols = columnList(m[2]);
      addRows(tableIdent(m[1]), cols, st.copyData.map((line) => line.split('\t').map(unescapeCopy)));
    } else if (/^(SELECT|WITH)\b/i.test(sql)) {
      queries++;
    } else other++;
  }

  const withRows = [...tables.values()].filter((t) => t.rows.length);
  if (!withRows.length) {
    if (schema.size)
      throw new Error(
        `This SQL file only defines table structure (${[...schema.keys()].slice(0, 4).join(', ')}${schema.size > 4 ? '…' : ''}) and contains no INSERT or COPY rows, so there is no data to chart. Export the data with your database's dump tool (with data), or as CSV.`,
      );
    if (queries) throw new Error(`This SQL file contains ${queries} quer${queries === 1 ? 'y' : 'ies'} (SELECT) but no data. Run the query in your database and export the results as CSV.`);
    throw new Error('No INSERT or COPY data statements were found in this SQL file.');
  }

  const notes: string[] = [];
  const empty = [...schema.keys()].filter((k) => !tables.get(k)?.rows.length);
  if (empty.length) notes.push(`Tables defined without rows were skipped: ${empty.slice(0, 6).join(', ')}${empty.length > 6 ? '…' : ''}.`);
  if (insertSelect) notes.push(`${insertSelect} INSERT … SELECT statement${insertSelect > 1 ? 's were' : ' was'} skipped (they copy data inside the database).`);
  for (const t of withRows) if (t.truncated) notes.push(`“${t.name}” was cut to the first ${MAX_ROWS_PER_TABLE.toLocaleString()} rows.`);

  const multi = withRows.length > 1;
  const parsed = withRows.map((t) => ({
    name: multi ? `${base} · ${t.name}` : t.name === base ? base : `${base} · ${t.name}`,
    ...buildTable(
      t.columns,
      t.rows.map((r) => t.columns.map((c) => (r[c] === undefined ? null : r[c]))),
    ),
  }));
  return { tables: parsed, notes };
}

export async function parseSql(file: File): Promise<ParsedTable[]> {
  const { tables, notes } = tablesFromSql(await file.text(), file.name.replace(/\.[^.]+$/, ''));
  if (notes.length) tables[0].notes = notes;
  return tables;
}
