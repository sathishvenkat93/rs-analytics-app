import Papa from 'papaparse';
import { buildTable, type RawCell } from '../infer';
import type { ParsedTable } from './index';

/** Delimited text. `delimiter` undefined = auto-detect (comma, semicolon, tab, pipe). */
function parseDelimited(file: File, delimiter?: string): Promise<ParsedTable[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      delimiter,
      skipEmptyLines: 'greedy',
      complete: (result) => {
        const fatal = result.errors.find((e) => e.type === 'Delimiter' && result.data.length === 0);
        if (fatal) {
          reject(new Error(`Couldn't read ${file.name}: ${fatal.message}`));
          return;
        }
        const [header = [], ...body] = result.data;
        const { columns, rows } = buildTable(header, body as RawCell[][]);
        const table: ParsedTable = { name: file.name.replace(/\.[^.]+$/, ''), columns, rows };
        // Ragged rows usually mean the wrong delimiter or an unquoted separator inside a value.
        const width = header.length;
        const ragged = body.filter((r) => r.length !== width).length;
        if (ragged > 0) table.notes = [`${ragged.toLocaleString()} row${ragged > 1 ? 's have' : ' has'} a different number of fields than the header; extra fields were dropped and missing ones left empty.`];
        resolve([table]);
      },
      error: (err) => reject(new Error(`Couldn't read ${file.name}: ${err.message}`)),
    });
  });
}

export const parseCsv = (file: File) => parseDelimited(file);
export const parseTsv = (file: File) => parseDelimited(file, '\t');
