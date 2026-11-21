import fs from 'node:fs';
import path from 'node:path';
import { ingestDataset, DATA_FILES, REQUIRED_COLUMNS } from './importer.ts';
import { csvEscape } from './spending.ts';
import { loadHistory } from './history.ts';
import { withSystem } from './db.ts';
// After any data change (import, upload, live entry) recompute everything derived from it.
import type { Db } from './db.ts';
import { clearHistoryCache } from './history.ts';
import { clearTrailCache } from './trail.ts';
import { clearRefCache } from './tickets.ts';
import { openFlagCases, runCaseSweep } from './cases.ts';

export async function refreshDerived(db: Db, now: Date) {
  clearHistoryCache();
  clearTrailCache();
  clearRefCache();
  const opened = await openFlagCases(db, now);
  const escalated = await runCaseSweep(db, now);
  return { opened, escalated };
}


export function liveDir(): string {
  const d = path.join(process.env.LIVE_DATA_DIR || path.join(process.cwd(), '.data', 'live-data'), new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 6));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** Ingest uploaded files (name must be one of the dataset file names) and recompute everything derived. */
export async function ingestUploads(db: Db, files: { name: string; text: string }[], now: Date) {
  const dir = liveDir();
  for (const f of files) {
    if (!(DATA_FILES as readonly string[]).includes(f.name)) throw new Error(`Unknown file name "${f.name}". Use one of: ${DATA_FILES.join(', ')}`);
    fs.writeFileSync(path.join(dir, f.name), f.text);
  }
  const before = await flagKeys(db);
  const r = await ingestDataset(db, dir, { origin: 'live_upload', sourceRepo: 'Live upload', commit: 'live_upload' });
  const derived = await refreshDerived(db, now);
  const after = await flagKeys(db);
  return { ...r, ...derived, newFlags: [...after].filter((k) => !before.has(k)) };
}

/** One record typed into the app: written as a one-row CSV and ingested through the same validation. */
export async function ingestRecord(db: Db, file: 'work_orders.csv' | 'complaints.csv', record: Record<string, string>, now: Date) {
  const cols = file === 'work_orders.csv'
    ? ['work_order_id', 'linked_complaint_ids', 'ward_code', 'road_id', 'work_type', 'repair_method', 'contractor_id', 'contractor_name', 'assigned_at', 'work_started_at', 'completed_at', 'area_sqm', 'cost_inr', 'sla_hours', 'sla_met', 'reopened_within_30d', 'engineer_remark']
    : ['complaint_id', 'received_at', 'channel', 'category_reported', 'description', 'language', 'locality_text', 'ward_code', 'lat', 'lon', 'gps_accuracy_m', 'photo_url', 'photo_description', 'complainant_id', 'upvotes', 'status', 'resolved_at'];
  for (const c of REQUIRED_COLUMNS[file]) if (!record[c]?.toString().trim()) throw new Error(`Fill in ${c.replace(/_/g, ' ')}`);
  const dir = liveDir();
  fs.writeFileSync(path.join(dir, file), [cols.join(','), cols.map((c) => csvEscape(record[c] ?? '')).join(',')].join('\n'));
  const r = await ingestDataset(db, dir, { origin: 'live_entry', sourceRepo: 'Live entry', commit: 'live_entry' });
  const derived = await refreshDerived(db, now);
  const id = file === 'work_orders.csv' ? record.work_order_id : record.complaint_id;
  const flags = file === 'work_orders.csv' ? await withSystem(async (q) => (await loadHistory(q)).flags.filter((f) => f.work_order_id === id), db) : [];
  const cases = file === 'work_orders.csv' ? (await withSystem((q) => q.query<{ ref: string; flag_type: string }>('select ref, flag_type from accountability_cases where work_order_id = $1', [id]), db)).rows : [];
  return { id, issues: r.issues.filter((i) => i.record_id === id || !i.record_id), counts: r.counts, flags, cases, ...derived };
}

async function flagKeys(db: Db) {
  return withSystem(async (q) => new Set((await loadHistory(q)).flags.map((f) => `${f.work_order_id}|${f.type}`)), db);
}
