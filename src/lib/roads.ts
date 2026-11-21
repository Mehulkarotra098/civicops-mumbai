// Road QR: the warranty clock (defect-liability period) and everything public about one road segment.
// Pure warranty maths (unit-tested) + loaders that reuse the cached history (work orders, flags).
// All records are the synthetic Claude Impact Lab dataset, not BMC records.
import type { Queryable } from './db.ts';
import { loadHistory, type Road, type FlagType } from './history.ts';
import { pointToSegmentM } from './geo.ts';

/**
 * Standard BMC defect-liability periods (DLP) by surface: during this time the contractor who laid
 * the surface must repair defects at no cost to the city. Cement-concrete roads carry 10 years,
 * mastic asphalt 5 years, asphalt / bituminous roads 3 years. Any other surface (e.g. paver blocks)
 * has no standard value here, so its warranty is shown as unknown rather than guessed.
 */
export const DLP_YEARS = { concrete: 10, mastic: 5, asphalt: 3 } as const;

/** The synthetic dataset's records run Jun–Oct 2025; its `under_dlp` flag describes that moment. */
export const DATASET_AS_OF = new Date('2025-10-31T18:29:59Z');
export const EXPIRING_DAYS = 90;
const DAY = 86400_000;

export type WarrantyState = 'active' | 'expiring' | 'expired' | 'unknown';
export type WarrantyBasis = 'Dataset flag' | 'Assumed from surface type' | 'Unknown';

export interface Warranty {
  start: Date | null; years: number | null; expires: Date | null; daysLeft: number | null;
  state: WarrantyState; basis: WarrantyBasis; pctUsed: number | null;
  /** The dataset's own flag (as of Oct 2025) and a plain note when it disagrees with the surface rule. */
  datasetFlag: boolean; note: string | null;
  left: { years: number; months: number; days: number } | null;
}

/** DLP years for a surface name, or null when no standard value is known. */
export function dlpYears(surface: string | null | undefined): number | null {
  const s = (surface ?? '').toLowerCase();
  if (!s) return null;
  if (s.includes('mastic')) return DLP_YEARS.mastic;
  if (s.includes('concrete') || /\bcc\b/.test(s) || s.includes('cement')) return DLP_YEARS.concrete;
  if (s.includes('asphalt') || s.includes('bitum') || /\btar(mac)?\b/.test(s)) return DLP_YEARS.asphalt;
  return null;
}

function toDay(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  const x = typeof d === 'string' ? new Date(d.length <= 10 ? `${d}T00:00:00Z` : d) : d;
  return Number.isNaN(x.getTime()) ? null : x;
}

function addYears(d: Date, years: number): Date {
  // Calendar-day arithmetic in IST so a 4 May start ends on 4 May.
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  return new Date(Date.UTC(ist.getUTCFullYear() + years, ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3600_000);
}

/** Calendar years / months / days from `from` to `to` (IST), for the countdown. */
export function breakdown(from: Date, to: Date): { years: number; months: number; days: number } {
  const a = new Date(from.getTime() + 5.5 * 3600_000), b = new Date(to.getTime() + 5.5 * 3600_000);
  let y = b.getUTCFullYear() - a.getUTCFullYear();
  let m = b.getUTCMonth() - a.getUTCMonth();
  let d = b.getUTCDate() - a.getUTCDate();
  if (d < 0) { m -= 1; d += new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 0)).getUTCDate(); }
  if (m < 0) { y -= 1; m += 12; }
  return { years: Math.max(0, y), months: Math.max(0, m), days: Math.max(0, d) };
}

export function warrantyFor(road: Pick<Road, 'surface' | 'last_resurfaced' | 'under_dlp'>, now: Date = new Date(), asOf: Date = DATASET_AS_OF): Warranty {
  const start = toDay(road.last_resurfaced);
  const years = dlpYears(road.surface);
  const datasetFlag = !!road.under_dlp;
  if (!start || years == null) {
    return {
      start, years, expires: null, daysLeft: null, state: 'unknown', basis: 'Unknown', pctUsed: null, datasetFlag, left: null,
      note: !start ? 'No resurfacing date is on record.'
        : `There is no standard defect-liability period on record for ${road.surface?.toLowerCase() || 'this surface'}${datasetFlag ? ', although the dataset lists this road under defect liability (as of Oct 2025)' : ''}.`,
    };
  }
  const expires = addYears(start, years);
  const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / DAY);
  const state: WarrantyState = daysLeft <= 0 ? 'expired' : daysLeft <= EXPIRING_DAYS ? 'expiring' : 'active';
  // The dataset flag describes Oct 2025: it "agrees" when the surface rule gives the same answer then.
  const activeAtAsOf = start.getTime() <= asOf.getTime() && expires.getTime() > asOf.getTime();
  const agrees = activeAtAsOf === datasetFlag;
  const pctUsed = Math.max(0, Math.min(100, ((now.getTime() - start.getTime()) / (expires.getTime() - start.getTime())) * 100));
  return {
    start, years, expires, daysLeft, state, basis: agrees ? 'Dataset flag' : 'Assumed from surface type', pctUsed, datasetFlag,
    left: daysLeft > 0 ? breakdown(now, expires) : null,
    note: agrees ? null : datasetFlag
      ? `The dataset lists this road under defect liability, but the standard ${years}-year period for this surface would have ended earlier. Dates here follow the surface rule.`
      : `The dataset does not list this road under defect liability. This date assumes the standard ${years}-year period for this surface.`,
  };
}

/** Short plain-language state, always shown next to the colour. */
export const WARRANTY_LABEL: Record<WarrantyState, string> = {
  active: 'Free repair active', expiring: 'Free repair ends soon', expired: 'Free repair ended', unknown: 'Warranty unknown',
};
/** Honest basis wording for the UI (the data is synthetic, so "Dataset", never "Verified"). */
export const BASIS_LABEL: Record<WarrantyBasis, string> = {
  'Dataset flag': 'Dataset', 'Assumed from surface type': 'Assumed from surface type', Unknown: 'Unknown',
};

export const FLAG_LABEL: Record<FlagType, string> = {
  dlp_paid: 'Paid during the free-repair period', over_rate: 'Billed well above the rate card', double_billing: 'Possible double bill',
  over_budget: 'Billed after the ward budget ran out', sla_missed: 'Missed the time target', reopened: 'Repair failed within 30 days',
  incomplete_evidence: 'No completion evidence on record', data_quality: 'Record does not add up',
};

export const NEAR_ROAD_M = 150;

export interface RoadWorkOrder {
  work_order_id: string; work_type: string; repair_method: string; contractor_id: string; contractor_name: string;
  assigned_at: Date; completed_at: Date; cost_inr: number; expected_cost: number; cost_ratio: number; reopened: boolean; dlp_paid: boolean;
}
export interface RoadTicket { ref: string; category_code: string; status: string; priority: string; submitted_at: Date }
export interface RoadComplaint { complaint_id: string; received_at: Date; category: string; status: string; channel: string | null }

export interface RoadProfile {
  road: Road;
  ward: { code: string; name: string; office: string | null; boundary: number[][] | null };
  warranty: Warranty;
  workOrders: RoadWorkOrder[];
  totalBilled: number; totalExpected: number; reopenCount: number;
  flags: { type: FlagType; label: string; work_order_id: string; amount_at_issue: number; reason: string }[];
  paidTwice: { work_order_id: string; billed: number; expected: number; assigned_at: Date; contractor_name: string }[];
  contractor: { id: string; name: string; how: string } | null;
  complaints: { count: number; open: number; latest: RoadComplaint[] };
  tickets: RoadTicket[]; openTickets: number;
  midpoint: { lat: number; lon: number };
}

const CLOSED = new Set(['verified_resolved', 'cancelled', 'duplicate', 'referred']);

export async function roadProfile(q: Queryable, roadId: string, now: Date = new Date()): Promise<RoadProfile | null> {
  const h = await loadHistory(q);
  const road = h.roads.get(roadId);
  if (!road) return null;
  const warranty = warrantyFor(road, now);
  const wos = h.wos.filter((w) => w.road_id === roadId).sort((a, b) => b.assigned_at.getTime() - a.assigned_at.getTime());
  const roadFlags = h.flags.filter((f) => wos.some((w) => w.work_order_id === f.work_order_id));
  const dlpIds = new Set(roadFlags.filter((f) => f.type === 'dlp_paid').map((f) => f.work_order_id));
  const workOrders: RoadWorkOrder[] = wos.map((w) => ({
    work_order_id: w.work_order_id, work_type: w.work_type, repair_method: w.repair_method, contractor_id: w.contractor_id, contractor_name: w.contractor_name,
    assigned_at: w.assigned_at, completed_at: w.completed_at, cost_inr: w.cost_inr, expected_cost: w.expected_cost, cost_ratio: w.cost_ratio,
    reopened: !!w.reopened_within_30d, dlp_paid: dlpIds.has(w.work_order_id),
  }));

  // Responsible contractor: the dataset has no resurfacing contract, so use the work order nearest
  // the resurfacing date (else the latest one) and say so.
  let contractor: RoadProfile['contractor'] = null;
  if (wos.length) {
    const ref = warranty.start?.getTime();
    const pick = ref != null ? [...wos].sort((a, b) => Math.abs(a.assigned_at.getTime() - ref) - Math.abs(b.assigned_at.getTime() - ref))[0] : wos[0];
    contractor = { id: pick.contractor_id, name: pick.contractor_name, how: ref != null ? 'From the repair record nearest the resurfacing date (the resurfacing contract itself is not in the dataset)' : 'From the latest repair record' };
  }

  const ward = (await q.query<{ ward_code: string; ward_name: string; office_name: string | null; boundary_geojson: { coordinates?: number[][][] } | null }>(
    'select ward_code, ward_name, office_name, boundary_geojson from wards where ward_code = $1', [road.ward_code])).rows[0];

  // Box around the segment, about 150 m wide, then exact distance to the line.
  const pad = 0.0016;
  const box = [Math.min(road.start_lat, road.end_lat) - pad, Math.max(road.start_lat, road.end_lat) + pad, Math.min(road.start_lon, road.end_lon) - pad, Math.max(road.start_lon, road.end_lon) + pad];
  const near = (lat: number | null, lon: number | null) => lat != null && lon != null && pointToSegmentM(Number(lat), Number(lon), road.start_lat, road.start_lon, road.end_lat, road.end_lon) <= NEAR_ROAD_M;

  const woIds = wos.map((w) => w.work_order_id);
  const comps = (await q.query<{ complaint_id: string; received_at: Date; category_reported: string; status: string; channel: string | null; lat: number | null; lon: number | null; linked: boolean }>(
    `select c.complaint_id, c.received_at, c.category_reported, c.status, c.channel, c.lat, c.lon,
       exists (select 1 from hist_work_order_complaints l where l.complaint_id = c.complaint_id and l.work_order_id = any($1)) as linked
     from hist_complaints c
     where c.complaint_id in (select complaint_id from hist_work_order_complaints where work_order_id = any($1))
        or (c.lat between $2 and $3 and c.lon between $4 and $5)
     order by c.received_at desc`, [woIds, ...box])).rows.filter((c) => c.linked || near(c.lat, c.lon));

  const tix = (await q.query<RoadTicket & { lat: number | null; lon: number | null; road_id: string | null }>(
    `select ref, category_code, status, priority, submitted_at, lat, lon, road_id from tickets
     where status <> 'duplicate' and (road_id = $1 or (lat between $2 and $3 and lon between $4 and $5))
     order by submitted_at desc`, [roadId, ...box])).rows.filter((t) => t.road_id === roadId || near(t.lat, t.lon));
  const tickets = tix.map(({ ref, category_code, status, priority, submitted_at }) => ({ ref, category_code, status, priority, submitted_at }))
    .sort((a, b) => Number(CLOSED.has(a.status)) - Number(CLOSED.has(b.status)) || b.submitted_at.getTime() - a.submitted_at.getTime());

  return {
    road,
    ward: { code: road.ward_code, name: ward?.ward_name ?? road.ward_code, office: ward?.office_name ?? null, boundary: ward?.boundary_geojson?.coordinates?.[0] ?? null },
    warranty, workOrders,
    totalBilled: wos.reduce((s, w) => s + w.cost_inr, 0), totalExpected: wos.reduce((s, w) => s + w.expected_cost, 0),
    reopenCount: wos.filter((w) => w.reopened_within_30d).length,
    flags: roadFlags.map((f) => ({ type: f.type, label: FLAG_LABEL[f.type], work_order_id: f.work_order_id, amount_at_issue: f.amount_at_issue, reason: f.reason })),
    paidTwice: wos.filter((w) => dlpIds.has(w.work_order_id)).map((w) => ({ work_order_id: w.work_order_id, billed: w.cost_inr, expected: w.expected_cost, assigned_at: w.assigned_at, contractor_name: w.contractor_name })),
    contractor,
    complaints: {
      count: comps.length,
      open: comps.filter((c) => /^(open|in progress)/i.test(c.status ?? '')).length,
      latest: comps.slice(0, 5).map((c) => ({ complaint_id: c.complaint_id, received_at: c.received_at, category: c.category_reported, status: c.status, channel: c.channel })),
    },
    tickets: tickets.slice(0, 10), openTickets: tickets.filter((t) => !CLOSED.has(t.status)).length,
    midpoint: { lat: (road.start_lat + road.end_lat) / 2, lon: (road.start_lon + road.end_lon) / 2 },
  };
}

export interface RoadCard {
  road_id: string; road_name: string; segment_no: number; ward_code: string; surface: string; road_type: string; length_m: number; bus_route: boolean;
  state: WarrantyState; basis: WarrantyBasis; expires: string | null; daysLeft: number | null; pctUsed: number | null; years: number | null;
  repairs: number; billed: number; paidTwice: number;
}

/** Every road with its warranty state and money signals, for the public directory. */
export async function roadDirectory(q: Queryable, now: Date = new Date()) {
  const h = await loadHistory(q);
  const woRoad = new Map(h.wos.map((w) => [w.work_order_id, w.road_id]));
  const dlp = new Map<string, number>();
  for (const f of h.flags) if (f.type === 'dlp_paid') { const r = woRoad.get(f.work_order_id); if (r) dlp.set(r, (dlp.get(r) ?? 0) + 1); }
  const jobs = new Map<string, { n: number; billed: number }>();
  for (const w of h.wos) { const j = jobs.get(w.road_id) ?? { n: 0, billed: 0 }; j.n++; j.billed += w.cost_inr; jobs.set(w.road_id, j); }
  const cards: RoadCard[] = [...h.roads.values()].map((r) => {
    const w = warrantyFor(r, now);
    return {
      road_id: r.road_id, road_name: r.road_name, segment_no: r.segment_no, ward_code: r.ward_code, surface: r.surface, road_type: r.road_type,
      length_m: Number(r.length_m), bus_route: r.bus_route, state: w.state, basis: w.basis, expires: w.expires?.toISOString() ?? null,
      daysLeft: w.daysLeft, pctUsed: w.pctUsed, years: w.years, repairs: jobs.get(r.road_id)?.n ?? 0, billed: jobs.get(r.road_id)?.billed ?? 0, paidTwice: dlp.get(r.road_id) ?? 0,
    };
  }).sort((a, b) => a.road_id.localeCompare(b.road_id));
  const stats = {
    roads: cards.length,
    underWarranty: cards.filter((c) => c.state === 'active' || c.state === 'expiring').length,
    expiring: cards.filter((c) => c.state === 'expiring').length,
    expired: cards.filter((c) => c.state === 'expired').length,
    unknown: cards.filter((c) => c.state === 'unknown').length,
    paidTwiceFlags: [...dlp.values()].reduce((s, n) => s + n, 0),
    paidTwiceRoads: dlp.size,
  };
  return { cards, stats, wards: h.wards.map((w) => ({ code: w.ward_code, name: w.ward_name })) };
}
