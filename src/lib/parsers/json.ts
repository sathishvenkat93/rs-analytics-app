import { buildTable, type RawCell } from '../infer';
import type { ParsedTable } from './index';

/**
 * JSON / JSONL → tables.
 *
 * - Finds the record arrays: a top-level array, or arrays of objects inside a
 *   wrapper such as `{ "data": [...] }` or `{ "results": { "items": [...] } }`.
 * - Flattens nested objects into dotted columns (`customer.region`).
 * - Joins arrays of plain values (`"red, blue"`).
 * - Turns arrays of objects inside a record (e.g. order line items) into a
 *   linked child table, plus a `<field> (count)` column on the parent.
 * - GeoJSON FeatureCollections become one row per feature, with
 *   latitude/longitude columns for points.
 */

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };
type FlatRow = Record<string, RawCell>;

const MAX_DEPTH = 6;
const MAX_SEARCH_DEPTH = 4;
const MAX_TABLES = 12;
const MAX_COLUMNS = 300;
const ID_KEYS = ['id', '_id', 'uuid', 'key', 'code', 'sku', 'name', 'title'];

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPrimitive = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v);

interface Ctx {
  base: string;
  tables: ParsedTable[];
  notes: string[];
}

/* ---------- flattening ---------- */

interface ChildRows {
  rows: { parentRef: RawCell; record: Obj }[];
}

function flattenInto(obj: Obj, prefix: string, out: FlatRow, children: Map<string, ChildRows>, parentRef: RawCell, depth: number) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v === null || v === undefined) out[key] = null;
    else if (Array.isArray(v)) {
      if (v.length === 0) out[key] = null;
      else if (v.every(isPrimitive)) out[key] = v.filter((x) => x !== null).join(', ');
      else if (v.some(isObj)) {
        out[`${key} (count)`] = v.length;
        let bucket = children.get(key);
        if (!bucket) children.set(key, (bucket = { rows: [] }));
        for (const item of v) if (isObj(item)) bucket.rows.push({ parentRef, record: item });
      } else out[key] = JSON.stringify(v);
    } else if (isObj(v)) {
      if (depth < MAX_DEPTH) flattenInto(v, key, out, children, parentRef, depth + 1);
      else out[key] = JSON.stringify(v);
    } else out[key] = v as RawCell;
  }
}

/** A GeoJSON Feature → its properties plus coordinates for points. */
function unwrapFeature(f: Obj): Obj {
  const props = isObj(f.properties) ? { ...f.properties } : {};
  const g = f.geometry;
  if (isObj(g)) {
    props['geometry type'] = g.type ?? null;
    if (g.type === 'Point' && Array.isArray(g.coordinates) && typeof g.coordinates[0] === 'number') {
      props.longitude = g.coordinates[0];
      props.latitude = g.coordinates[1] ?? null;
    }
  }
  if (f.id !== undefined && props.id === undefined) props.id = f.id;
  return props;
}

function idFieldOf(records: Obj[]): string | null {
  for (const k of ID_KEYS) if (records.length && records.every((r) => isPrimitive(r[k]) && r[k] !== null)) return k;
  return null;
}

/** Records → a table (and, recursively, child tables for nested arrays of objects). */
function addRecordTable(ctx: Ctx, name: string, records: Obj[], parent?: { label: string; refs: RawCell[] }, level = 0) {
  if (ctx.tables.length >= MAX_TABLES) {
    ctx.notes.push(`Stopped after ${MAX_TABLES} tables; “${name}” and any later nested lists were skipped.`);
    return;
  }
  const isFeatures = records.length > 0 && records.every((r) => r.type === 'Feature' && 'geometry' in r);
  const rows = isFeatures ? records.map(unwrapFeature) : records;
  const idField = idFieldOf(rows);
  const children = new Map<string, ChildRows>();
  const flat: FlatRow[] = rows.map((r, i) => {
    const out: FlatRow = {};
    if (parent) out[parent.label] = parent.refs[i];
    const ref = idField ? (r[idField] as RawCell) : i + 1;
    flattenInto(r, '', out, children, ref, 0);
    return out;
  });

  // Union of keys in first-seen order.
  const seen = new Set<string>();
  for (const r of flat) for (const k of Object.keys(r)) seen.add(k);
  let headers = [...seen];
  if (headers.length > MAX_COLUMNS) {
    ctx.notes.push(`“${name}” has ${headers.length} fields; kept the first ${MAX_COLUMNS}.`);
    headers = headers.slice(0, MAX_COLUMNS);
  }
  const body = flat.map((r) => headers.map((h) => (r[h] === undefined ? null : r[h])));
  ctx.tables.push({ name, ...buildTable(headers, body) });

  if (level >= 2) {
    if (children.size) ctx.notes.push(`Lists nested deeper than two levels in “${name}” are counted, not expanded.`);
    return;
  }
  const label = idField ? `${shortName(name)}.${idField}` : `${shortName(name)} row`;
  for (const [key, bucket] of children) {
    addRecordTable(
      ctx,
      `${name} › ${key}`,
      bucket.rows.map((r) => r.record),
      { label, refs: bucket.rows.map((r) => r.parentRef) },
      level + 1,
    );
  }
}

function shortName(name: string): string {
  const last = name.split(' › ').pop() ?? name;
  return last.split(' · ').pop() ?? last;
}

/* ---------- other shapes ---------- */

function addMatrix(ctx: Ctx, name: string, rows: Json[][]) {
  const first = rows[0] ?? [];
  const hasHeader = first.length > 0 && first.every((c) => typeof c === 'string') && rows.slice(1).some((r) => r.some((c) => typeof c !== 'string'));
  const width = Math.max(...rows.map((r) => r.length));
  const header = hasHeader ? first : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  const body = (hasHeader ? rows.slice(1) : rows).map((r) => r.map((c) => (isPrimitive(c) ? (c as RawCell) : JSON.stringify(c))));
  ctx.tables.push({ name, ...buildTable(header, body) });
}

function addPrimitives(ctx: Ctx, name: string, values: Json[]) {
  ctx.tables.push({ name, ...buildTable(['value'], values.map((v) => [isPrimitive(v) ? (v as RawCell) : JSON.stringify(v)])) });
}

/** Handles any array found in the document. Returns false if it holds nothing tabular. */
function addArray(ctx: Ctx, name: string, arr: Json[]): boolean {
  if (!arr.length) return false;
  const objs = arr.filter(isObj);
  if (objs.length >= arr.length / 2) {
    if (objs.length < arr.length) ctx.notes.push(`“${name}”: skipped ${arr.length - objs.length} items that weren’t objects.`);
    addRecordTable(ctx, name, objs);
    return true;
  }
  if (arr.every(Array.isArray)) {
    addMatrix(ctx, name, arr as Json[][]);
    return true;
  }
  if (arr.every(isPrimitive)) {
    addPrimitives(ctx, name, arr);
    return true;
  }
  return false;
}

/** Every array of records reachable from an object, with its dotted path. */
function findArrays(node: Json, path: string, depth: number, out: { path: string; arr: Json[] }[]) {
  if (Array.isArray(node)) {
    if (node.length && (node.some(isObj) || node.every(Array.isArray))) out.push({ path, arr: node });
    return;
  }
  if (!isObj(node) || depth >= MAX_SEARCH_DEPTH) return;
  for (const [k, v] of Object.entries(node)) findArrays(v, path ? `${path}.${k}` : k, depth + 1, out);
}

function tableName(base: string, path: string, single: boolean): string {
  return single || !path ? base : `${base} · ${path}`;
}

/* ---------- entry points (pure, testable) ---------- */

export function tablesFromJson(value: Json, base: string): { tables: ParsedTable[]; notes: string[] } {
  const ctx: Ctx = { base, tables: [], notes: [] };
  if (Array.isArray(value)) {
    if (!addArray(ctx, base, value)) throw new Error('The JSON array is empty or holds no tabular data.');
  } else if (isObj(value)) {
    const found: { path: string; arr: Json[] }[] = [];
    findArrays(value, '', 0, found);
    if (found.length) {
      found.sort((a, b) => b.arr.length - a.arr.length);
      for (const f of found) addArray(ctx, tableName(base, f.path, found.length === 1), f.arr);
    } else {
      const vals = Object.values(value);
      if (vals.length >= 2 && vals.every(isObj)) {
        // Keyed map: { "US": {...}, "UK": {...} } → one row per key.
        addRecordTable(ctx, base, Object.entries(value).map(([key, v]) => ({ key, ...(v as Obj) })));
      } else {
        addRecordTable(ctx, base, [value]);
        ctx.notes.push('The file holds a single object, so it became a one-row table.');
      }
    }
  } else {
    throw new Error('The JSON file holds a single value, not records.');
  }
  return { tables: ctx.tables, notes: ctx.notes };
}

export function tablesFromJsonLines(text: string, base: string): { tables: ParsedTable[]; notes: string[] } {
  const values: Json[] = [];
  const bad: number[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    try {
      values.push(JSON.parse(t) as Json);
    } catch {
      bad.push(i + 1);
    }
  });
  const total = values.length + bad.length;
  if (total === 0) throw new Error('The file is empty.');
  if (values.length === 0 || bad.length > total / 2) {
    throw new Error(`Couldn’t read this as JSON Lines: ${bad.length} of ${total} lines aren’t valid JSON (first at line ${bad[0]}). If it’s a single JSON document, rename it to .json.`);
  }
  const { tables, notes } = tablesFromJson(values, base);
  if (bad.length) notes.unshift(`Skipped ${bad.length} invalid line${bad.length > 1 ? 's' : ''} (line ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? ', …' : ''}).`);
  return { tables, notes };
}

/* ---------- file adapters ---------- */

const baseName = (f: File) => f.name.replace(/\.[^.]+$/, '');

async function readText(file: File): Promise<string> {
  return (await file.text()).replace(/^﻿/, '');
}

function withNotes(result: { tables: ParsedTable[]; notes: string[] }): ParsedTable[] {
  if (result.tables[0] && result.notes.length) result.tables[0].notes = result.notes;
  return result.tables;
}

export async function parseJson(file: File): Promise<ParsedTable[]> {
  const text = await readText(file);
  let value: Json;
  try {
    value = JSON.parse(text) as Json;
  } catch (e) {
    // A .json file that is really JSON Lines is common; try that before giving up.
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length > 1) {
      try {
        const res = tablesFromJsonLines(text, baseName(file));
        res.notes.unshift('This .json file holds one JSON value per line, so it was read as JSON Lines.');
        return withNotes(res);
      } catch {
        /* fall through to the original error */
      }
    }
    throw new Error(`${file.name} isn’t valid JSON: ${(e as Error).message}`);
  }
  try {
    return withNotes(tablesFromJson(value, baseName(file)));
  } catch (e) {
    throw new Error(`${file.name}: ${(e as Error).message}`);
  }
}

export async function parseJsonLines(file: File): Promise<ParsedTable[]> {
  try {
    return withNotes(tablesFromJsonLines(await readText(file), baseName(file)));
  } catch (e) {
    throw new Error(`${file.name}: ${(e as Error).message}`);
  }
}
