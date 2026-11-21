// Complaints → issues → work orders, on the synthetic repo data.
// Messy input handled here: blank wards (inferred from GPS or the locality text), category picked
// by the citizen vs what the words say (English, Hinglish, Marathi, Hindi), duplicates, and open
// complaints that never got a work order (grouped into issues). Originals are never overwritten.
import type { Queryable } from './db.ts';
import { resolveLocation, type RefData } from './routing.ts';
import { normalizeText } from './geo.ts';

export type TextCategory = 'waterlogging' | 'pothole' | 'manhole' | 'drain' | 'cave_in' | 'paver';
const RULES: { cat: TextCategory; re: RegExp }[] = [
  { cat: 'manhole', re: /manhole|मैनहोल|dhakkan|ढक्कन|झाकण|open chamber|chamber cover/i },
  { cat: 'cave_in', re: /cave-?in|sunk|sinkhole|dhans|धसल|धँस/i },
  { cat: 'paver', re: /paver|पेव्हर|पेवर/i },
  { cat: 'drain', re: /nullah|nala\b|नाला|नाले|choked drain|drain|culvert|gutter overflow|गटार तुंब/i },
  { cat: 'waterlogging', re: /waterlog|water ?logged|flood|knee deep|ghutne|paani bhar|itna paani|पानी भर|पाणी साच|not receding|send pump|पंप/i },
  { cat: 'pothole', re: /pothole|pot hole|gadd?a|khadd?a|खड्डा|खड्डे|गड्ढा|crater/i },
];
const TEXT_TO_REPORTED: Record<TextCategory, string> = {
  waterlogging: 'Waterlogging', pothole: 'Pothole', manhole: 'Open or broken manhole', drain: 'Choked drain / nullah overflow', cave_in: 'Road cave-in', paver: 'Broken paver blocks',
};

export function classifyText(text: string): { category: TextCategory | null; label: string | null; matched: string | null } {
  for (const r of RULES) {
    const m = text.match(r.re);
    if (m) return { category: r.cat, label: TEXT_TO_REPORTED[r.cat], matched: m[0] };
  }
  return { category: null, label: null, matched: null };
}

export type StatusClass = 'fixed' | 'duplicate_on_job' | 'open_unfixed' | 'forwarded' | 'rejected';

export interface TrailComplaint {
  complaint_id: string; received_at: Date; channel: string; category_reported: string; description: string; language: string;
  locality_text: string; ward_code: string | null; lat: number | null; lon: number | null; status: string; resolved_at: Date | null; upvotes: number;
  photo_description: string | null; complainant_hash: string; in_sample_200: boolean;
  inferred_ward: string | null; ward_source: 'recorded' | 'gps' | 'locality' | 'unresolved';
  text_category: string | null; text_matched: string | null; category_mismatch: boolean;
  status_class: StatusClass; work_orders: string[]; issue_id: string;
}

let cache: { at: number; v: number; rows: TrailComplaint[]; issues: Map<string, TrailComplaint[]> } | null = null;
export function clearTrailCache() { cache = null; }

export async function loadTrail(q: Queryable, ref: RefData) {
  const v = (await q.query<{ v: number }>('select coalesce(max(id), 0)::int as v from import_runs')).rows[0].v;
  if (cache && cache.v === v && Date.now() - cache.at < 30 * 60_000) return cache;
  const comps = (await q.query<Omit<TrailComplaint, 'inferred_ward' | 'ward_source' | 'text_category' | 'text_matched' | 'category_mismatch' | 'status_class' | 'work_orders' | 'issue_id'>>(
    `select complaint_id, received_at, channel, category_reported, description, language, locality_text, ward_code, lat, lon, status, resolved_at, upvotes,
       photo_description, complainant_hash, in_sample_200 from hist_complaints order by received_at`)).rows;
  const links = (await q.query<{ complaint_id: string; work_order_id: string }>('select complaint_id, work_order_id from hist_work_order_complaints')).rows;
  const byC = new Map<string, string[]>();
  for (const l of links) byC.set(l.complaint_id, [...(byC.get(l.complaint_id) ?? []), l.work_order_id]);

  const rows: TrailComplaint[] = comps.map((c) => {
    let inferred = c.ward_code, source: TrailComplaint['ward_source'] = 'recorded';
    if (!c.ward_code) {
      const r = resolveLocation({ lat: c.lat, lon: c.lon, source: c.lat != null ? 'gps' : 'locality', localityText: c.locality_text, address: c.description }, ref);
      inferred = r.wardCode; source = r.wardCode ? (r.pointWard ? 'gps' : 'locality') : 'unresolved';
    }
    const tc = classifyText(c.description ?? '');
    const wos = byC.get(c.complaint_id) ?? [];
    const status_class: StatusClass = wos.length ? (c.status === 'Closed - Duplicate' ? 'duplicate_on_job' : 'fixed')
      : c.status.startsWith('Forwarded') ? 'forwarded' : c.status.startsWith('Rejected') ? 'rejected' : 'open_unfixed';
    return { ...c, upvotes: Number(c.upvotes), inferred_ward: inferred, ward_source: source, text_category: tc.label, text_matched: tc.matched,
      category_mismatch: !!tc.label && tc.label !== c.category_reported, status_class, work_orders: wos, issue_id: wos.length ? wos[0] : '' };
  });

  // Group open, never-fixed complaints into issues: same ward, same problem (by words, else as picked),
  // same locality, within 14 days of the first report.
  const open = rows.filter((r) => r.status_class === 'open_unfixed').sort((a, b) => a.received_at.getTime() - b.received_at.getTime());
  const groups = new Map<string, { id: string; start: number }[]>();
  let n = 0;
  for (const r of open) {
    const key = `${r.inferred_ward ?? '?'}|${r.text_category ?? r.category_reported}|${normalizeText(r.locality_text ?? '')}`;
    const list = groups.get(key) ?? [];
    let g = list.find((x) => r.received_at.getTime() - x.start <= 14 * 86400_000);
    if (!g) { g = { id: `ISSUE-${String(++n).padStart(4, '0')}`, start: r.received_at.getTime() }; list.push(g); groups.set(key, list); }
    r.issue_id = g.id;
  }
  for (const r of rows) if (!r.issue_id) r.issue_id = r.status_class === 'forwarded' ? 'FORWARDED' : 'REJECTED';
  const issues = new Map<string, TrailComplaint[]>();
  for (const r of rows) issues.set(r.issue_id, [...(issues.get(r.issue_id) ?? []), r]);
  cache = { at: Date.now(), v, rows, issues };
  return cache;
}

export function trailSummary(rows: TrailComplaint[]) {
  const count = (f: (r: TrailComplaint) => boolean) => rows.filter(f).length;
  const jobs = new Set(rows.flatMap((r) => r.work_orders));
  const openIssues = new Set(rows.filter((r) => r.status_class === 'open_unfixed').map((r) => r.issue_id));
  return {
    complaints: rows.length,
    linked: count((r) => r.work_orders.length > 0),
    jobs: jobs.size,
    fixed: count((r) => r.status_class === 'fixed'),
    duplicates: count((r) => r.status_class === 'duplicate_on_job'),
    openUnfixed: count((r) => r.status_class === 'open_unfixed'),
    openIssues: openIssues.size,
    forwarded: count((r) => r.status_class === 'forwarded'),
    rejected: count((r) => r.status_class === 'rejected'),
    blankWard: count((r) => !r.ward_code),
    wardInferred: count((r) => !r.ward_code && !!r.inferred_ward),
    categoryMismatch: count((r) => r.category_mismatch),
    languages: Object.entries(rows.reduce<Record<string, number>>((m, r) => { m[r.language] = (m[r.language] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]),
  };
}
