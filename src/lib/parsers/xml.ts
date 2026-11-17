import { tablesFromJson, type Json, type Obj } from './json';
import type { ParsedTable } from './index';

/**
 * XML → tables. The document becomes nested objects (attributes and child
 * elements as keys) and then goes through the JSON pipeline, so record
 * detection, dotted columns and linked child tables work the same way.
 *
 * An element name that ever repeats under a given parent is always treated as
 * a list, so `<order>` with one `<item>` and `<order>` with three give the same
 * column shape.
 */

function textOf(el: Element): string {
  let t = '';
  for (const n of el.childNodes) if (n.nodeType === 3 || n.nodeType === 4) t += n.nodeValue ?? '';
  return t.trim();
}

/** Parent/child name pairs that occur more than once under one parent anywhere in the document. */
function repeatingPairs(root: Element): Set<string> {
  const out = new Set<string>();
  const walk = (el: Element) => {
    const counts = new Map<string, number>();
    for (const c of el.children) counts.set(c.localName, (counts.get(c.localName) ?? 0) + 1);
    for (const [name, n] of counts) if (n > 1) out.add(`${el.localName}/${name}`);
    for (const c of el.children) walk(c);
  };
  walk(root);
  return out;
}

function toJson(el: Element, lists: Set<string>): Json {
  const obj: Obj = {};
  for (const a of el.attributes) {
    if (a.name === 'xmlns' || a.name.startsWith('xmlns:')) continue;
    obj[a.localName] = a.value;
  }
  const kids = [...el.children];
  const text = textOf(el);
  if (!kids.length) {
    if (Object.keys(obj).length === 0) return text === '' ? null : text;
    if (text) obj.value = text;
    return obj;
  }
  // Collection wrapper (<items><item/><item/></items>) → just the list.
  if (!Object.keys(obj).length && !text && kids.every((k) => k.localName === kids[0].localName) && lists.has(`${el.localName}/${kids[0].localName}`)) {
    return kids.map((k) => toJson(k, lists));
  }
  for (const c of kids) {
    const name = c.localName;
    const v = toJson(c, lists);
    if (lists.has(`${el.localName}/${name}`)) {
      const prev = obj[name];
      const arr = Array.isArray(prev) ? prev : prev === undefined ? [] : [prev];
      arr.push(v);
      obj[name] = arr;
    } else {
      // A child element named like an attribute keeps both.
      obj[name in obj ? `${name}_element` : name] = v;
    }
  }
  if (text) obj.text = text;
  return obj;
}

export function tablesFromXml(text: string, base: string): { tables: ParsedTable[]; notes: string[] } {
  const doc = new DOMParser().parseFromString(text.replace(/^\uFEFF/, ''), 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) {
    // Browsers wrap the parser message in boilerplate; keep the "line X, column Y: problem" part.
    const raw = (err.textContent ?? '').replace(/This page contains the following errors:|Below is a rendering of the page up to the first error\.?/gi, ' ').replace(/\s+/g, ' ').trim();
    const msg = raw.replace(/^error on /i, '').replace(/\.$/, '');
    throw new Error(`This isn’t well-formed XML${msg ? `: ${msg.slice(0, 160)}` : ''}. Check that every tag is closed and the file isn’t truncated.`);
  }
  const root = doc.documentElement;
  if (root.localName.toLowerCase() === 'html') throw new Error('This is an HTML page, not an XML data file.');
  const value = toJson(root, repeatingPairs(root));
  if (value === null || typeof value !== 'object') throw new Error('The XML document has no elements with data.');
  return tablesFromJson({ [root.localName]: value } as Json, base);
}

export async function parseXml(file: File): Promise<ParsedTable[]> {
  const { tables, notes } = tablesFromXml(await file.text(), file.name.replace(/\.[^.]+$/, ''));
  if (notes.length) tables[0].notes = notes;
  return tables;
}
