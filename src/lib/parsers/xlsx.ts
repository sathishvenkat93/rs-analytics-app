import * as XLSX from 'xlsx';
import { buildTable, type RawCell } from '../infer';
import type { ParsedTable } from './index';

/** Each non-empty worksheet becomes its own table. */
export async function parseXlsx(file: File): Promise<ParsedTable[]> {
  const buffer = await file.arrayBuffer();
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  } catch (e) {
    throw new Error(`Couldn't read ${file.name}: ${(e as Error).message}`);
  }
  const base = file.name.replace(/\.[^.]+$/, '');
  const multi = workbook.SheetNames.length > 1;
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<RawCell[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false });
    const [header = [], ...body] = aoa;
    const { columns, rows } = buildTable(header, body);
    return { name: multi ? `${base} · ${sheetName}` : base, columns, rows };
  });
}
