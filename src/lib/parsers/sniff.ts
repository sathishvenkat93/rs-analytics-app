/**
 * Identifies a file from its first bytes, for files whose extension is
 * missing, unknown or wrong. Returns either the format to read it as, or a
 * plain-language reason it holds no table.
 */

export type SniffResult = { format: 'csv' | 'tsv' | 'json' | 'jsonl' | 'xml' | 'sql' | 'sqlite' | 'xlsx'; label: string } | { reject: string; label: string };

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

export async function sniffFile(file: File): Promise<SniffResult> {
  const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
  if (head.length === 0) return { reject: 'The file is empty.', label: 'Empty file' };

  // Binary signatures
  if (startsWith(head, [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00])) return { format: 'sqlite', label: 'SQLite database' };
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46])) return { reject: 'This is a PDF document. Tables inside PDFs can’t be read; export the table as CSV or Excel instead.', label: 'PDF document' };
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) {
    const text = new TextDecoder('latin1').decode(head);
    if (text.includes('xl/')) return { format: 'xlsx', label: 'Excel workbook' };
    const kind = text.includes('word/') ? 'Word document' : text.includes('ppt/') ? 'PowerPoint deck' : 'ZIP archive';
    return { reject: `This is a ${kind}, not a data table. Save the data as CSV, Excel or JSON.`, label: kind };
  }
  if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0])) return { format: 'xlsx', label: 'Legacy Excel/Office file' };
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47]) || startsWith(head, [0xff, 0xd8, 0xff]) || startsWith(head, [0x47, 0x49, 0x46, 0x38]))
    return { reject: 'This is an image. Charts need rows and columns of data, not pictures.', label: 'Image' };
  if (startsWith(head, [0x1f, 0x8b])) return { reject: 'This is a compressed (gzip) file. Unzip it first, then upload the file inside.', label: 'Gzip archive' };

  // Text heuristics
  let controls = 0;
  for (const b of head) if (b < 9 || (b > 13 && b < 32)) controls++;
  if (controls / head.length > 0.05) return { reject: 'This is a binary file of an unknown type; it doesn’t contain readable rows and columns.', label: 'Unknown binary' };

  const text = new TextDecoder().decode(head).replace(/^\uFEFF/, '');
  const t = text.trimStart();
  const lines = t.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  if (/^<!doctype html|^<html/i.test(t)) return { reject: 'This is an HTML web page, not a data file.', label: 'HTML page' };
  if (t.startsWith('<')) return { format: 'xml', label: 'XML' };
  if (t.startsWith('{') || t.startsWith('[')) {
    const jsonl = lines.length > 1 && lines.every((l) => /^\s*[{[]/.test(l) && /[}\]]\s*$/.test(l));
    return jsonl ? { format: 'jsonl', label: 'JSON Lines' } : { format: 'json', label: 'JSON' };
  }
  if (/^(--|\/\*|CREATE\s|INSERT\s|BEGIN|SET\s|DROP\s|PRAGMA|COPY\s|USE\s)/i.test(t) || /\bINSERT\s+INTO\b/i.test(text)) return { format: 'sql', label: 'SQL script' };
  const tabs = lines.filter((l) => l.includes('\t')).length;
  if (lines.length && tabs >= Math.ceil(lines.length * 0.8)) return { format: 'tsv', label: 'Tab-separated text' };
  const delimited = lines.filter((l) => /[,;|]/.test(l)).length;
  if (lines.length >= 2 && delimited >= Math.ceil(lines.length * 0.8)) return { format: 'csv', label: 'Delimited text' };
  return { reject: 'This looks like plain text without a consistent column structure (no delimiter, JSON, XML or SQL data found).', label: 'Plain text' };
}
