// Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, embedded newlines, UTF-8 BOM).
export function parseCsv(text: string): { header: string[]; rows: Record<string, string>[] } {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { record.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      record.push(field); field = '';
      if (record.length > 1 || record[0] !== '') records.push(record);
      record = [];
    } else field += c;
  }
  if (field !== '' || record.length) { record.push(field); records.push(record); }
  const header = records.shift() ?? [];
  const rows = records.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
  return { header, rows };
}
