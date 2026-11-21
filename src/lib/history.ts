// Historical accountability on the synthetic repo data: money trail, repair audit flags,
// fair contractor scorecards and a next-rupee ranking. Computed in TypeScript from the
// imported tables (small: 2,499 jobs, 291 roads) and cached; every number links to rows.
import type { Queryable } from './db.ts';
import { haversineM, pointToSegmentM } from './geo.ts';

export const NORMAL_BAND_MAX = 1.3; // repo: "normal jobs vary roughly 20 to 30% around the rate"
export const OVER_RATE_THRESHOLD = 1.35; // first value clearly outside the observed normal band (max 1.316)
export const DOUBLE_BILL_WINDOW_DAYS = 10;
export const BUDGET_PERIOD = { start: '2025-06-01', end: '2025-09-30', label: '1 Jun – 30 Sep 2025 (monsoon budget period)' };

export interface WorkOrder {
  work_order_id: string; ward_code: string; road_id: string; work_type: string; repair_method: string;
  contractor_id: string; contractor_name: string; assigned_at: Date; work_started_at: Date; completed_at: Date;
  area_sqm: number; cost_inr: number; sla_hours: number; sla_met: boolean; reopened_within_30d: boolean;
  engineer_remark: string | null; linked_complaint_ids_raw: string | null;
}
export interface Road { road_id: string; road_name: string; segment_no: number; ward_code: string; road_type: string; surface: string; lanes: number; length_m: number; last_resurfaced: Date | null; under_dlp: boolean; bus_route: boolean; start_lat: number; start_lon: number; end_lat: number; end_lon: number }
export interface Rate { repair_method: string; unit: 'per sqm' | 'per job'; standard_rate_inr: number }

export type FlagType = 'over_rate' | 'double_billing' | 'dlp_paid' | 'sla_missed' | 'reopened' | 'data_quality';
export const MONEY_FLAGS: FlagType[] = ['over_rate', 'double_billing', 'dlp_paid'];
export interface Flag {
  type: FlagType; work_order_id: string; ward_code: string; contractor_id: string; amount_at_issue: number; reason: string; evidence: Record<string, unknown>;
}

export interface Enriched extends WorkOrder {
  expected_cost: number; cost_ratio: number; unit: string; rate: number; road: Road | undefined;
  hours_first_complaint_to_completion: number | null; heavy_rain_during_job: number; complaints: string[];
}

interface Cache {
  at: number; wos: Enriched[]; roads: Map<string, Road>; rates: Map<string, Rate>; flags: Flag[];
  rainByDate: Map<string, number>; wards: WardRow[];
}
export interface WardRow { ward_code: string; ward_name: string; zone: string; budget_inr_2025: number; low_lying_index: number; engineering_crews: number; population_est: number }

let cache: Cache | null = null;
const day = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10); // IST calendar day

export async function loadHistory(q: Queryable): Promise<Cache> {
  if (cache && Date.now() - cache.at < 30 * 60_000) return cache;
  const wos = (await q.query<WorkOrder>('select * from hist_work_orders order by assigned_at')).rows;
  const roads = new Map((await q.query<Road>('select road_id, road_name, segment_no, ward_code, road_type, surface, lanes, length_m, last_resurfaced, under_dlp, bus_route, start_lat, start_lon, end_lat, end_lon from roads')).rows.map((r) => [r.road_id, r]));
  const rates = new Map((await q.query<Rate>('select repair_method, unit, standard_rate_inr from rate_card')).rows.map((r) => [r.repair_method, r]));
  const firstComplaint = new Map((await q.query<{ work_order_id: string; first_at: Date; ids: string[] }>(
    `select l.work_order_id, min(c.received_at) as first_at, array_agg(l.complaint_id order by c.received_at) as ids
     from hist_work_order_complaints l join hist_complaints c on c.complaint_id = l.complaint_id group by l.work_order_id`)).rows.map((r) => [r.work_order_id, r]));
  const rain = (await q.query<{ date: Date | string; mm: number }>('select date, max(rainfall_mm) as mm from hist_rainfall group by date')).rows;
  const rainByDate = new Map(rain.map((r) => [typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date.getTime() + 12 * 3600_000).toISOString().slice(0, 10), Number(r.mm)]));
  const wards = (await q.query<WardRow>('select ward_code, ward_name, zone, budget_inr_2025::float8 as budget_inr_2025, low_lying_index, engineering_crews, population_est from wards order by ward_code')).rows;

  const enriched: Enriched[] = wos.map((w) => {
    const rate = rates.get(w.repair_method)!;
    const expected = rate.unit === 'per sqm' ? Number(w.area_sqm) * rate.standard_rate_inr : rate.standard_rate_inr;
    const fc = firstComplaint.get(w.work_order_id);
    let heavy = 0;
    for (let d = new Date(w.assigned_at); d <= w.completed_at; d = new Date(d.getTime() + 86400_000)) heavy = Math.max(heavy, rainByDate.get(day(d)) ?? 0);
    return {
      ...w, cost_inr: Number(w.cost_inr), area_sqm: Number(w.area_sqm),
      expected_cost: expected, cost_ratio: Number(w.cost_inr) / expected, unit: rate.unit, rate: rate.standard_rate_inr, road: roads.get(w.road_id),
      hours_first_complaint_to_completion: fc ? (w.completed_at.getTime() - new Date(fc.first_at).getTime()) / 3600_000 : null,
      heavy_rain_during_job: heavy, complaints: fc?.ids ?? [],
    };
  });

  const flags: Flag[] = [];
  const byRoadType = new Map<string, Enriched[]>();
  for (const w of enriched) {
    const k = `${w.road_id}|${w.work_type}`;
    byRoadType.set(k, [...(byRoadType.get(k) ?? []), w]);
  }
  for (const w of enriched) {
    if (w.cost_ratio > OVER_RATE_THRESHOLD) {
      flags.push({
        type: 'over_rate', work_order_id: w.work_order_id, ward_code: w.ward_code, contractor_id: w.contractor_id,
        amount_at_issue: Math.round(w.cost_inr - w.expected_cost * NORMAL_BAND_MAX),
        reason: `Billed ${fmt(w.cost_inr)} against a reference of ${fmt(w.expected_cost)} (${w.unit === 'per sqm' ? `${w.area_sqm} m² × ${fmt(w.rate)}` : `${fmt(w.rate)} per job`}, ${w.repair_method}): ${w.cost_ratio.toFixed(2)}× the rate card. Normal jobs stay within ${NORMAL_BAND_MAX}×.`,
        evidence: { cost: w.cost_inr, expected: w.expected_cost, ratio: w.cost_ratio, area_sqm: w.area_sqm, rate: w.rate, unit: w.unit },
      });
    }
    if (!w.complaints.length) {
      const twins = (byRoadType.get(`${w.road_id}|${w.work_type}`) ?? []).filter((o) => o.work_order_id !== w.work_order_id && Math.abs(o.assigned_at.getTime() - w.assigned_at.getTime()) <= DOUBLE_BILL_WINDOW_DAYS * 86400_000);
      if (twins.length) {
        const t = twins[0];
        const gap = Math.abs(w.assigned_at.getTime() - t.assigned_at.getTime()) / 86400_000;
        flags.push({
          type: 'double_billing', work_order_id: w.work_order_id, ward_code: w.ward_code, contractor_id: w.contractor_id, amount_at_issue: Math.round(w.cost_inr),
          reason: `No complaint is linked, and ${t.work_order_id} billed the same work (${w.work_type}, ${w.repair_method === t.repair_method ? 'same method' : 'different method'}) on the same road ${gap.toFixed(1)} days apart${w.contractor_id === t.contractor_id ? ' by the same contractor' : ''}.`,
          evidence: { twin: t.work_order_id, gap_days: gap, same_contractor: w.contractor_id === t.contractor_id, same_area: w.area_sqm === t.area_sqm, twin_cost: t.cost_inr },
        });
      }
    }
    const road = w.road;
    if (road?.under_dlp && (!road.last_resurfaced || w.assigned_at >= road.last_resurfaced)) {
      flags.push({
        type: 'dlp_paid', work_order_id: w.work_order_id, ward_code: w.ward_code, contractor_id: w.contractor_id, amount_at_issue: Math.round(w.cost_inr),
        reason: `${road.road_name} (segment ${road.segment_no}) was resurfaced on ${road.last_resurfaced ? day(road.last_resurfaced) : 'an unknown date'} and is still under the Defect Liability Period, so the original contractor should have repaired it at no cost. The ward paid ${fmt(w.cost_inr)}.`,
        evidence: { last_resurfaced: road.last_resurfaced, surface: road.surface },
      });
    }
  }
  // Performance signals: shown with context (rain, remarks), never summed as money at issue.
  for (const w of enriched) {
    if (!w.sla_met) {
      const hours = w.hours_first_complaint_to_completion;
      const heavy = w.heavy_rain_during_job >= 64.5;
      const remarkRain = /rain/i.test(w.engineer_remark ?? '');
      flags.push({
        type: 'sla_missed', work_order_id: w.work_order_id, ward_code: w.ward_code, contractor_id: w.contractor_id, amount_at_issue: 0,
        reason: `Missed the ${w.sla_hours} h target${hours != null ? ` (${hours.toFixed(0)} h from first complaint)` : ''}. ${heavy ? `Context: heavy rain during the job (${w.heavy_rain_during_job} mm), so the delay may be justified.` : remarkRain ? `The remark blames rain, but recorded rainfall peaked at ${w.heavy_rain_during_job} mm (not heavy).` : 'No heavy rain recorded during the job.'}`,
        evidence: { sla_hours: w.sla_hours, hours, heavy_rain_mm: w.heavy_rain_during_job, remark: w.engineer_remark },
      });
      if (hours != null && (hours <= w.sla_hours) !== w.sla_met) {
        flags.push({ type: 'data_quality', work_order_id: w.work_order_id, ward_code: w.ward_code, contractor_id: w.contractor_id, amount_at_issue: 0,
          reason: `Recorded SLA result (${w.sla_met ? 'met' : 'missed'}) disagrees with the timestamps (${hours.toFixed(1)} h vs ${w.sla_hours} h target).`, evidence: { hours } });
      }
    } else if (w.hours_first_complaint_to_completion != null && w.hours_first_complaint_to_completion > w.sla_hours) {
      flags.push({ type: 'data_quality', work_order_id: w.work_order_id, ward_code: w.ward_code, contractor_id: w.contractor_id, amount_at_issue: 0,
        reason: `Recorded as SLA met, but first complaint to completion took ${w.hours_first_complaint_to_completion.toFixed(1)} h against a ${w.sla_hours} h target.`, evidence: { hours: w.hours_first_complaint_to_completion } });
    }
    if (w.reopened_within_30d) {
      const later = enriched.find((o) => o.road_id === w.road_id && o.work_type === w.work_type && o.assigned_at > w.completed_at && o.assigned_at.getTime() - w.completed_at.getTime() <= 30 * 86400_000);
      flags.push({
        type: 'reopened', work_order_id: w.work_order_id, ward_code: w.ward_code, contractor_id: w.contractor_id, amount_at_issue: 0,
        reason: `The ${w.repair_method.toLowerCase()} failed within 30 days${later ? `; ${later.work_order_id} re-did the work on ${day(later.assigned_at)}` : ''}. ${w.road?.under_dlp ? 'Road is under DLP: the original contractor should bear the redo.' : ''}`.trim(),
        evidence: { redo: later?.work_order_id ?? null, method: w.repair_method },
      });
    }
  }
  cache = { at: Date.now(), wos: enriched, roads, rates, flags, rainByDate, wards };
  return cache;
}

export function clearHistoryCache() { cache = null; }

function fmt(n: number) { return '₹' + Math.round(n).toLocaleString('en-IN'); }
const inPeriod = (d: Date) => { const s = day(d); return s >= BUDGET_PERIOD.start && s <= BUDGET_PERIOD.end; };

// ---------------------------------------------------------------- money trail
export function moneyTrail(c: Cache, ward?: string) {
  const rows = c.wards.filter((w) => !ward || w.ward_code === ward).map((w) => {
    const jobs = c.wos.filter((x) => x.ward_code === w.ward_code);
    const inP = jobs.filter((x) => inPeriod(x.assigned_at));
    const spend = inP.reduce((s, x) => s + x.cost_inr, 0);
    const outside = jobs.filter((x) => !inPeriod(x.assigned_at)).reduce((s, x) => s + x.cost_inr, 0);
    const failed = inP.filter((x) => x.reopened_within_30d).reduce((s, x) => s + x.cost_inr, 0);
    const flags = c.flags.filter((f) => f.ward_code === w.ward_code);
    const flagged = (t: FlagType) => flags.filter((f) => f.type === t).reduce((s, f) => s + f.amount_at_issue, 0);
    return {
      ...w, jobs: inP.length, jobs_outside_period: jobs.length - inP.length, spend, spend_outside_period: outside,
      utilisation: w.budget_inr_2025 ? spend / w.budget_inr_2025 : null, failed_fix_spend: failed,
      flagged_over_rate_excess: flagged('over_rate'), flagged_double_billing: flagged('double_billing'), flagged_dlp_paid: flagged('dlp_paid'),
      flag_counts: { over_rate: flags.filter((f) => f.type === 'over_rate').length, double_billing: flags.filter((f) => f.type === 'double_billing').length, dlp_paid: flags.filter((f) => f.type === 'dlp_paid').length },
      by_method: groupSum(inP, (x) => x.repair_method), by_contractor: groupSum(inP, (x) => x.contractor_name),
    };
  });
  return rows;
}

function groupSum(rows: Enriched[], key: (r: Enriched) => string) {
  const m = new Map<string, { key: string; jobs: number; spend: number; reopened: number }>();
  for (const r of rows) {
    const k = key(r);
    const e = m.get(k) ?? { key: k, jobs: 0, spend: 0, reopened: 0 };
    e.jobs++; e.spend += r.cost_inr; if (r.reopened_within_30d) e.reopened++;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.spend - a.spend);
}

// ---------------------------------------------------------------- fair contractor scorecards
export function methodReopenRates(c: Cache) {
  const m = groupSum(c.wos, (x) => x.repair_method);
  return new Map(m.map((x) => [x.key, x.reopened / x.jobs]));
}

export function scorecards(c: Cache) {
  const methodRate = methodReopenRates(c);
  const lowLying = new Map(c.wards.map((w) => [w.ward_code, w.low_lying_index]));
  const ids = [...new Set(c.wos.map((w) => w.contractor_id))].sort();
  return ids.map((id) => {
    const jobs = c.wos.filter((w) => w.contractor_id === id);
    const name = jobs[0].contractor_name;
    const reopened = jobs.filter((j) => j.reopened_within_30d).length;
    const expectedReopen = jobs.reduce((s, j) => s + (methodRate.get(j.repair_method) ?? 0), 0);
    const slaMet = jobs.filter((j) => j.sla_met).length;
    const dry = jobs.filter((j) => j.heavy_rain_during_job < 64.5); // IMD "heavy" starts at 64.5 mm/day
    const dryMet = dry.filter((j) => j.sla_met).length;
    const ratios = jobs.map((j) => j.cost_ratio).sort((a, b) => a - b);
    const flags = c.flags.filter((f) => f.contractor_id === id);
    const avgLowLying = jobs.reduce((s, j) => s + (lowLying.get(j.ward_code) ?? 0), 0) / jobs.length;
    const card = {
      contractor_id: id, contractor_name: name, jobs: jobs.length, billed: jobs.reduce((s, j) => s + j.cost_inr, 0),
      sla_met_pct: slaMet / jobs.length, sla_met_pct_outside_heavy_rain: dry.length ? dryMet / dry.length : null, heavy_rain_jobs: jobs.length - dry.length,
      reopen_pct: reopened / jobs.length, expected_reopen_pct: expectedReopen / jobs.length, durability_index: expectedReopen ? reopened / expectedReopen : null,
      median_cost_ratio: ratios[Math.floor(ratios.length / 2)],
      over_rate_flags: flags.filter((f) => f.type === 'over_rate').length, double_billing_flags: flags.filter((f) => f.type === 'double_billing').length,
      avg_low_lying_index: avgLowLying,
      summary: '',
    };
    card.summary = scorecardSummary(card);
    return card;
  });
}

function pct(x: number | null) { return x == null ? '—' : `${Math.round(x * 100)}%`; }

/** Plain-language, non-accusatory summary (under 120 words). */
export function scorecardSummary(s: { contractor_name: string; jobs: number; sla_met_pct: number; sla_met_pct_outside_heavy_rain: number | null; reopen_pct: number; expected_reopen_pct: number; median_cost_ratio: number; over_rate_flags: number; double_billing_flags: number; heavy_rain_jobs: number }) {
  const dur = s.reopen_pct <= s.expected_reopen_pct * 0.9 ? 'held up better than expected for the repair methods used'
    : s.reopen_pct >= s.expected_reopen_pct * 1.1 ? 'failed within 30 days more often than expected for the repair methods used' : 'lasted about as expected for the repair methods used';
  const speed = `${pct(s.sla_met_pct)} of jobs met the time target${s.sla_met_pct_outside_heavy_rain != null ? ` (${pct(s.sla_met_pct_outside_heavy_rain)} when there was no heavy rain during the job)` : ''}`;
  const cost = `The typical bill was ${s.median_cost_ratio.toFixed(2)}× the rate card`;
  const flags = s.over_rate_flags + s.double_billing_flags;
  const improve = s.over_rate_flags > 0 ? `explain the ${s.over_rate_flags} bills well above the rate card` : s.reopen_pct > s.expected_reopen_pct ? 'use longer-lasting methods where repairs keep reopening' : 'keep response times up during heavy-rain weeks';
  return `${s.contractor_name} did ${s.jobs} repair jobs. ${speed}. Repairs ${dur} (${pct(s.reopen_pct)} reopened vs ${pct(s.expected_reopen_pct)} expected). ${cost}${flags ? `, and ${flags} bill${flags === 1 ? '' : 's'} need a closer look` : ''}. One thing to improve: ${improve}. These are review signals from synthetic records, not findings of wrongdoing.`;
}

// ---------------------------------------------------------------- next rupee
export interface RiskInputs { complaintsOpen: number; complaintsTotal: number; reopenedJobs: number; jobs: number; hotspot: { name: string; depth: number; years: number } | null; congestion: number | null; peakVehicles: number | null; accidents: number; hospitalAccess: string[]; schools: number; busRoute: boolean }

export async function nextRupee(q: Queryable, c: Cache, ward: string) {
  const roads = [...c.roads.values()].filter((r) => r.ward_code === ward);
  const roadIds = roads.map((r) => r.road_id);
  const traffic = new Map((await q.query<{ road_id: string; congestion_index: number; peak_hour_vehicles: number }>('select road_id, congestion_index, peak_hour_vehicles from road_traffic where road_id = any($1)', [roadIds])).rows.map((r) => [r.road_id, r]));
  const acc = new Map((await q.query<{ road_id: string; n: number }>(`select road_id, count(*)::int as n from hist_accidents where road_id = any($1) and probable_cause in ('Pothole','Waterlogged road','Uneven road / open chamber') group by road_id`, [roadIds])).rows.map((r) => [r.road_id, r.n]));
  const fac = (await q.query<{ name: string; type: string; lat: number; lon: number; ambulance_entry_road: string | null; emergency_services: boolean }>('select name, type, lat, lon, ambulance_entry_road, emergency_services from facilities where ward_code = $1', [ward])).rows;
  const hs = (await q.query<{ name: string; lat: number; lon: number; avg_water_depth_cm: number; years_flagged_last_5: number; tide_sensitive: boolean; flood_threshold_mm: number }>('select name, lat, lon, avg_water_depth_cm, years_flagged_last_5, tide_sensitive, flood_threshold_mm from flood_hotspots where ward_code = $1', [ward])).rows;
  // Days in the 2025 season when recorded rain crossed each hotspot's flooding threshold.
  const rainDays = [...c.rainByDate.values()];
  const comps = (await q.query<{ lat: number; lon: number; status: string }>(`select lat, lon, status from hist_complaints where ward_code = $1 and lat is not null and mapped_category in ('road_damage','waterlogging','drain_sewer')`, [ward])).rows;
  const methodRate = methodReopenRates(c);
  const mt = moneyTrail(c, ward)[0];
  const remaining = mt ? mt.budget_inr_2025 - mt.spend : 0;

  const scored = roads.map((r) => {
    const mid = { lat: (r.start_lat + r.end_lat) / 2, lon: (r.start_lon + r.end_lon) / 2 };
    const near = comps.filter((x) => pointToSegmentM(x.lat, x.lon, r.start_lat, r.start_lon, r.end_lat, r.end_lon) <= 120);
    const jobs = c.wos.filter((w) => w.road_id === r.road_id);
    const hotspot = hs.map((h) => ({ h, d: haversineM(mid.lat, mid.lon, h.lat, h.lon) })).filter((x) => x.d <= 400).sort((a, b) => a.d - b.d)[0];
    const t = traffic.get(r.road_id);
    const inputs: RiskInputs = {
      complaintsOpen: near.filter((x) => x.status === 'Open' || x.status === 'In Progress').length, complaintsTotal: near.length,
      reopenedJobs: jobs.filter((j) => j.reopened_within_30d).length, jobs: jobs.length,
      hotspot: hotspot ? { name: hotspot.h.name, depth: hotspot.h.avg_water_depth_cm, years: hotspot.h.years_flagged_last_5 } : null,
      congestion: t?.congestion_index ?? null, peakVehicles: t?.peak_hour_vehicles ?? null, accidents: acc.get(r.road_id) ?? 0,
      hospitalAccess: fac.filter((f) => f.type === 'Hospital' && f.ambulance_entry_road === r.road_id).map((f) => f.name),
      schools: fac.filter((f) => f.type === 'School' && (f.ambulance_entry_road === r.road_id || haversineM(mid.lat, mid.lon, f.lat, f.lon) <= 300)).length,
      busRoute: r.bus_route,
    };
    const parts: { label: string; points: number }[] = [];
    const add = (label: string, points: number) => { if (points > 0) parts.push({ label, points: Math.round(points * 10) / 10 }); };
    add(`${inputs.complaintsOpen} open complaints nearby`, Math.min(inputs.complaintsOpen, 10) * 2);
    add(`${inputs.reopenedJobs} repairs failed within 30 days`, Math.min(inputs.reopenedJobs, 6) * 3);
    add(`${inputs.jobs} repair jobs this monsoon`, Math.min(inputs.jobs, 15) * 0.6);
    if (inputs.hotspot) {
      add(`Flood hotspot: ${inputs.hotspot.name} (flagged ${inputs.hotspot.years}/5 years)`, 4 + inputs.hotspot.years * 1.5);
      const h = hotspot!.h;
      const floodDays = rainDays.filter((mm) => mm >= h.flood_threshold_mm).length;
      add(`Rain crossed its ${h.flood_threshold_mm} mm flooding threshold on ${floodDays} days in 2025`, Math.min(floodDays, 10) * 0.6);
      if (h.tide_sensitive) add('Tide-sensitive: floods worse at big high tides (≥ 4.5 m)', 3);
    }
    if (inputs.congestion != null) add(`Congestion ${inputs.congestion}/10`, inputs.congestion * 0.8);
    add(`${inputs.accidents} accidents from potholes, waterlogging or open chambers`, inputs.accidents * 3);
    if (inputs.hospitalAccess.length) add(`Ambulance route to ${inputs.hospitalAccess.join(', ')}`, 10);
    add(`${inputs.schools} school(s) on or near the road`, inputs.schools * 2);
    if (inputs.busRoute) add('BEST bus route', 3);
    const score = parts.reduce((s, p) => s + p.points, 0);

    // Method: the most durable option for this road's most common work type.
    const types = groupSum(jobs, (j) => j.work_type);
    const workType = types[0]?.key ?? (inputs.hotspot ? 'Waterlogging' : 'Pothole');
    // Pumping is an emergency response, not a lasting fix: keep it for heavy-rain alerts and fund prevention.
    const EMERGENCY = new Set(['Dewatering pump deployed', 'Pump + debris removal']);
    const allMethods = [...new Set(c.wos.filter((w) => w.work_type === workType).map((w) => w.repair_method))];
    const preventive = allMethods.filter((m) => !EMERGENCY.has(m));
    const candidates = (preventive.length ? preventive : allMethods).map((m) => {
      const rate = c.rates.get(m)!;
      const area = median(jobs.filter((j) => j.repair_method === m).map((j) => j.area_sqm)) ?? median(c.wos.filter((w) => w.repair_method === m).map((w) => w.area_sqm)) ?? 5;
      const cost = rate.unit === 'per sqm' ? area * rate.standard_rate_inr : rate.standard_rate_inr;
      const reopen = methodRate.get(m) ?? 0;
      return { method: m, reopen_rate: reopen, est_cost: Math.round(cost), cost_per_lasting_fix: Math.round(cost / Math.max(0.05, 1 - reopen)) };
    }).sort((a, b) => a.cost_per_lasting_fix - b.cost_per_lasting_fix);
    const best = candidates[0];
    const standby = allMethods.some((m) => EMERGENCY.has(m)) ? 'Keep a dewatering pump on standby for orange/red rain alerts' : null;
    return { road_id: r.road_id, road_name: r.road_name, segment_no: r.segment_no, road_type: r.road_type, surface: r.surface, under_dlp: r.under_dlp, score: Math.round(score * 10) / 10, parts: parts.sort((a, b) => b.points - a.points), work_type: workType, recommended: best, alternatives: candidates.slice(1), standby, inputs };
  }).sort((a, b) => b.score - a.score);

  // Allocate: DLP roads are claimed from the original contractor (₹0 to the ward).
  let left = Math.max(0, remaining);
  const plan = scored.slice(0, 12).map((s) => {
    if (s.under_dlp) return { ...s, action: 'Claim under DLP: original contractor repairs at no cost', allocate: 0 };
    const cost = s.recommended?.est_cost ?? 0;
    if (cost <= left) { left -= cost; return { ...s, action: `Fund ${s.recommended?.method}`, allocate: cost }; }
    return { ...s, action: remaining <= 0 ? 'No budget headroom: fund from recovered excess billing first' : 'Next in line when funds free up', allocate: 0 };
  });
  return { ward, budget: mt?.budget_inr_2025 ?? 0, spend: mt?.spend ?? 0, remaining, plan, methodReopenRates: [...methodRate.entries()].map(([m, r]) => ({ method: m, reopen_rate: r })) };
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// ---------------------------------------------------------------- one work order, end to end
export async function traceWorkOrder(q: Queryable, c: Cache, id: string) {
  const w = c.wos.find((x) => x.work_order_id === id);
  if (!w) return null;
  const complaints = (await q.query('select * from hist_complaints where complaint_id = any($1) order by received_at', [w.complaints])).rows;
  const sameRoad = c.wos.filter((x) => x.road_id === w.road_id).sort((a, b) => a.assigned_at.getTime() - b.assigned_at.getTime());
  const flags = c.flags.filter((f) => f.work_order_id === id);
  const contractor = (await q.query('select * from contractors where contractor_id = $1', [w.contractor_id])).rows[0];
  const rain: { date: string; mm: number }[] = [];
  for (let d = new Date(w.assigned_at.getTime() - 86400_000); d <= new Date(w.completed_at.getTime() + 86400_000); d = new Date(d.getTime() + 86400_000)) rain.push({ date: day(d), mm: c.rainByDate.get(day(d)) ?? 0 });
  return { wo: w, complaints, sameRoad, flags, contractor, rain };
}
