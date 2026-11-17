import Papa from 'papaparse';
import { buildTable, type RawCell } from '../infer';
import type { ParsedTable } from './index';

export function parseCsv(file: File): Promise<ParsedTable[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: 'greedy',
      complete: (result) => {
        const fatal = result.errors.find((e) => e.type === 'Delimiter' && result.data.length === 0);
        if (fatal) {
          reject(new Error(`Couldn't read ${file.name}: ${fatal.message}`));
          return;
        }
        const [header = [], ...body] = result.data;
        const { columns, rows } = buildTable(header, body as RawCell[][]);
        resolve([{ name: file.name.replace(/\.[^.]+$/, ''), columns, rows }]);
      },
      error: (err) => reject(new Error(`Couldn't read ${file.name}: ${err.message}`)),
    });
  });
}
