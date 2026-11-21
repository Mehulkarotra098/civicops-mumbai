// Dataset ingestion used by `npm run db:import` and by live uploads / live entry in the app.
// Every file is optional and every row is upserted by its source ID, so live data merges with
// what is already there. After each ingest, everything derived is recomputed automatically:
// validation issues, complaint→work-order links, audit flags and their accountability cases.
import fs from 'node:fs';
import path from 'node:path';
import type { Db, Queryable } from './db.ts';
import { parseCsv } from './csv.ts';
import { CATEGORIES, DEPARTMENTS, DEFAULT_ROUTING, SLA_POLICY_V1, HIST_CATEGORY_MAP } from './config.ts';

export const DATA_FILES = [
  'wards.csv', 'wards.geojson', 'localities.csv', 'roads.csv', 'roads.geojson', 'complaints.csv',
  'complaints_sample_200.csv', 'work_orders.csv', 'contractors.csv', 'rate_card.csv', 'traffic.csv',
  'accidents.csv', 'facilities.csv', 'flood_hotspots.csv', 'rainfall_daily.csv', 'tides.csv', 'social_posts.csv',
] as const;

/** Required columns per CSV, used to validate uploads before anything is written. */
export const REQUIRED_COLUMNS: Record<string, string[]> = {
  'wards.csv': ['ward_code', 'ward_name', 'monsoon_repair_budget_inr_2025'],
  'localities.csv': ['locality', 'ward_code', 'lat', 'lon'],
  'roads.csv': ['road_id', 'road_name', 'ward_code', 'under_dlp'],
  'complaints.csv': ['complaint_id', 'received_at', 'category_reported', 'description', 'status'],
  'complaints_sample_200.csv': ['complaint_id'],
  'work_orders.csv': ['work_order_id', 'ward_code', 'road_id', 'work_type', 'repair_method', 'contractor_id', 'assigned_at', 'completed_at', 'area_sqm', 'cost_inr'],
  'contractors.csv': ['contractor_id', 'contractor_name'],
  'rate_card.csv': ['repair_method', 'unit', 'standard_rate_inr'],
  'traffic.csv': ['road_id'],
  'accidents.csv': ['accident_id', 'occurred_at'],
  'facilities.csv': ['facility_id', 'type', 'name'],
  'flood_hotspots.csv': ['hotspot_id', 'name', 'lat', 'lon'],
  'rainfall_daily.csv': ['date', 'station', 'rainfall_mm'],
  'tides.csv': ['date', 'height_m'],
  'social_posts.csv': ['post_id', 'text'],
};

export type Issue = { file: string; record_id?: string; severity: 'error' | 'warning' | 'info'; issue_type: string; message: string; data?: unknown };
export interface IngestResult { runId: number; counts: Record<string, { source_rows: number; imported: number; note?: string }>; issues: Issue[]; files: string[] }

// Timestamps in the dataset are IST without an offset; values with an explicit offset are kept as given.
const ist = (s: string) => {
  if (!s) return null;
  const v = s.trim();
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(v)) return v;
  return `${v.length === 10 ? v + ' 00:00' : v}${v.length <= 16 ? ':00' : ''}+05:30`.replace(' ', 'T');
};
const num = (s: string | undefined) => (s === '' || s == null ? null : Number(s));
const yn = (s: string | undefined) => (s ?? '').trim().toUpperCase() === 'Y' || (s ?? '').trim().toLowerCase() === 'true';

export function validateCsvHeader(file: string, text: string): string | null {
  const need = REQUIRED_COLUMNS[file];
  if (!need) return null;
  const { header } = parseCsv(text.split(/\r?\n/)[0] + '\n');
  const missing = need.filter((c) => !header.includes(c));
  return missing.length ? `${file} is missing column(s): ${missing.join(', ')}` : null;
}

async function insertMany(tx: Queryable, table: string, cols: string[], rows: unknown[][], conflict = '') {
  const batch = 250;
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const params: unknown[] = [];
    const values = chunk.map((r) => `(${r.map((v) => { params.push(v); return `$${params.length}`; }).join(',')})`).join(',');
    await tx.query(`insert into ${table} (${cols.join(',')}) values ${values} ${conflict}`, params);
  }
}

const upd = (cols: string[], key: string) => `on conflict (${key}) do update set ${cols.filter((c) => c !== key).map((c) => `${c}=excluded.${c}`).join(', ')}`;

export async function ingestDataset(db: Db, dir: string, opts: { origin?: string; sourceRepo?: string; commit?: string } = {}): Promise<IngestResult> {
  const origin = opts.origin ?? 'synthetic_repo';
  const has = (f: string) => fs.existsSync(path.join(dir, f));
  const read = (f: string) => parseCsv(fs.readFileSync(path.join(dir, f), 'utf8')).rows;
  const files = DATA_FILES.filter(has);
  for (const f of files) {
    if (!f.endsWith('.csv')) continue;
    const err = validateCsvHeader(f, fs.readFileSync(path.join(dir, f), 'utf8'));
    if (err) throw new Error(err);
  }
  const run = (await db.query<{ id: number }>(`insert into import_runs (source_repo, source_commit) values ($1, $2) returning id`,
    [opts.sourceRepo ?? dir, opts.commit ?? origin])).rows[0];
  const issues: Issue[] = [];
  const counts: IngestResult['counts'] = {};

  await db.transaction(async (tx) => {
    await tx.query(`select set_config('app.role', 'system', true)`);

    if (has('wards.csv')) {
      const wards = read('wards.csv');
      const geo = has('wards.geojson') ? JSON.parse(fs.readFileSync(path.join(dir, 'wards.geojson'), 'utf8')) : null;
      const shapes = new Map<string, unknown>();
      for (const f of geo?.features ?? []) shapes.set(f.properties.ward_code, f.geometry);
      for (const w of wards) {
        if (geo && !shapes.has(w.ward_code)) issues.push({ file: 'wards.geojson', record_id: w.ward_code, severity: 'error', issue_type: 'missing_boundary', message: `No polygon for ward ${w.ward_code}` });
        await tx.query(
          `insert into wards (ward_code, ward_name, zone, office_name, centroid_lat, centroid_lon, approx_area_km2, population_est, low_lying_index, engineering_crews, localities_text, budget_inr_2025, boundary_geojson, data_origin)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           on conflict (ward_code) do update set ward_name=excluded.ward_name, zone=excluded.zone, office_name=excluded.office_name, centroid_lat=excluded.centroid_lat,
             centroid_lon=excluded.centroid_lon, approx_area_km2=excluded.approx_area_km2, population_est=excluded.population_est, low_lying_index=excluded.low_lying_index,
             engineering_crews=excluded.engineering_crews, localities_text=excluded.localities_text, budget_inr_2025=excluded.budget_inr_2025,
             boundary_geojson=coalesce(excluded.boundary_geojson, wards.boundary_geojson)`,
          [w.ward_code, w.ward_name, w.zone || null, w.assistant_commissioner_office || null, num(w.centroid_lat), num(w.centroid_lon), num(w.approx_area_km2), num(w.population_est),
            num(w.low_lying_index), num(w.engineering_crews), w.localities || null, num(w.monsoon_repair_budget_inr_2025), shapes.has(w.ward_code) ? JSON.stringify(shapes.get(w.ward_code)) : null, origin]);
      }
      counts['wards.csv'] = { source_rows: wards.length, imported: wards.length };
      if (geo) counts['wards.geojson'] = { source_rows: geo.features.length, imported: shapes.size };
    }
    const wardSet = new Set((await tx.query<{ ward_code: string }>('select ward_code from wards')).rows.map((r) => r.ward_code));

    if (has('localities.csv')) {
      const locs = read('localities.csv');
      const names = locs.map((l) => l.locality);
      await tx.query('delete from localities where name = any($1)', [names]);
      const ok = locs.filter((l) => wardSet.has(l.ward_code));
      await insertMany(tx, 'localities', ['name', 'ward_code', 'lat', 'lon', 'aliases', 'aliases_raw', 'data_origin'],
        ok.map((l) => [l.locality, l.ward_code, num(l.lat), num(l.lon), l.aliases ? l.aliases.split(';').map((a) => a.trim()).filter(Boolean) : [], l.aliases || null, origin]));
      for (const l of locs) if (!wardSet.has(l.ward_code)) issues.push({ file: 'localities.csv', record_id: l.locality, severity: 'error', issue_type: 'unknown_ward', message: `Unknown ward ${l.ward_code}` });
      counts['localities.csv'] = { source_rows: locs.length, imported: ok.length };
    }

    if (has('roads.csv')) {
      const roads = read('roads.csv');
      const rgeo = has('roads.geojson') ? JSON.parse(fs.readFileSync(path.join(dir, 'roads.geojson'), 'utf8')) : null;
      const rshape = new Map<string, unknown>();
      for (const f of rgeo?.features ?? []) rshape.set(f.properties.road_id, f.geometry);
      const cols = ['road_id', 'road_name', 'segment_no', 'ward_code', 'road_type', 'surface', 'lanes', 'length_m', 'start_lat', 'start_lon', 'end_lat', 'end_lon', 'last_resurfaced', 'under_dlp', 'bus_route', 'geometry', 'data_origin'];
      const ok = roads.filter((r) => wardSet.has(r.ward_code));
      await insertMany(tx, 'roads', cols, ok.map((r) => [r.road_id, r.road_name, num(r.segment_no), r.ward_code, r.road_type || null, r.surface || null, num(r.lanes), num(r.length_m), num(r.start_lat), num(r.start_lon), num(r.end_lat), num(r.end_lon), r.last_resurfaced || null, yn(r.under_dlp), yn(r.bus_route),
        rshape.has(r.road_id) ? JSON.stringify(rshape.get(r.road_id)) : JSON.stringify({ type: 'LineString', coordinates: [[num(r.start_lon), num(r.start_lat)], [num(r.end_lon), num(r.end_lat)]] }), origin]), upd(cols, 'road_id'));
      for (const r of roads) if (!wardSet.has(r.ward_code)) issues.push({ file: 'roads.csv', record_id: r.road_id, severity: 'error', issue_type: 'unknown_ward', message: `Unknown ward ${r.ward_code}` });
      counts['roads.csv'] = { source_rows: roads.length, imported: ok.length };
      if (rgeo) counts['roads.geojson'] = { source_rows: rgeo.features.length, imported: rshape.size };
    }
    const roadSet = new Set((await tx.query<{ road_id: string }>('select road_id from roads')).rows.map((r) => r.road_id));

    if (has('traffic.csv')) {
      const traffic = read('traffic.csv');
      const cols = ['road_id', 'peak_hour_vehicles', 'avg_peak_speed_kmph', 'congestion_index', 'bus_routes_count', 'two_wheeler_share_pct'];
      const ok = traffic.filter((t) => roadSet.has(t.road_id));
      await insertMany(tx, 'road_traffic', cols, ok.map((t) => [t.road_id, num(t.peak_hour_vehicles), num(t.avg_peak_speed_kmph), num(t.congestion_index_0_10), num(t.bus_routes_count), num(t.two_wheeler_share_pct)]), upd(cols, 'road_id'));
      for (const t of traffic) if (!roadSet.has(t.road_id)) issues.push({ file: 'traffic.csv', record_id: t.road_id, severity: 'error', issue_type: 'unmatched_road', message: 'Traffic row for unknown road' });
      counts['traffic.csv'] = { source_rows: traffic.length, imported: ok.length };
    }

    if (has('contractors.csv')) {
      const cs = read('contractors.csv');
      const cols = ['contractor_id', 'contractor_name', 'empanelled_since', 'active_wards', 'data_origin'];
      await insertMany(tx, 'contractors', cols, cs.map((c) => [c.contractor_id, c.contractor_name, num(c.empanelled_since), (c.active_wards ?? '').split(';').map((s) => s.trim()).filter(Boolean), origin]), upd(cols, 'contractor_id'));
      counts['contractors.csv'] = { source_rows: cs.length, imported: cs.length };
    }
    if (has('rate_card.csv')) {
      const rates = read('rate_card.csv');
      const cols = ['repair_method', 'unit', 'standard_rate_inr', 'data_origin'];
      const ok = rates.filter((r) => r.unit === 'per sqm' || r.unit === 'per job');
      await insertMany(tx, 'rate_card', cols, ok.map((r) => [r.repair_method, r.unit, num(r.standard_rate_inr), origin]), upd(cols, 'repair_method'));
      for (const r of rates) if (!ok.includes(r)) issues.push({ file: 'rate_card.csv', record_id: r.repair_method, severity: 'error', issue_type: 'bad_unit', message: `Unit must be "per sqm" or "per job" (got "${r.unit}")` });
      counts['rate_card.csv'] = { source_rows: rates.length, imported: ok.length };
    }
    if (has('facilities.csv')) {
      const fac = read('facilities.csv');
      const cols = ['facility_id', 'type', 'name', 'ward_code', 'lat', 'lon', 'beds_or_students', 'emergency_services', 'ambulance_entry_road', 'data_origin'];
      await insertMany(tx, 'facilities', cols, fac.map((f) => [f.facility_id, f.type, f.name, wardSet.has(f.ward_code) ? f.ward_code : null, num(f.lat), num(f.lon), num(f.beds_or_students), yn(f.emergency_services), roadSet.has(f.ambulance_entry_road) ? f.ambulance_entry_road : null, origin]), upd(cols, 'facility_id'));
      for (const f of fac) if (f.ambulance_entry_road && !roadSet.has(f.ambulance_entry_road)) issues.push({ file: 'facilities.csv', record_id: f.facility_id, severity: 'warning', issue_type: 'unmatched_road', message: `Ambulance entry road ${f.ambulance_entry_road} not found` });
      counts['facilities.csv'] = { source_rows: fac.length, imported: fac.length };
    }
    if (has('flood_hotspots.csv')) {
      const hs = read('flood_hotspots.csv');
      const cols = ['hotspot_id', 'name', 'ward_code', 'lat', 'lon', 'flood_threshold_mm', 'tide_sensitive', 'avg_water_depth_cm', 'avg_recession_hours', 'pumping_station_nearby', 'years_flagged_last_5', 'data_origin'];
      await insertMany(tx, 'flood_hotspots', cols, hs.map((h) => [h.hotspot_id, h.name, wardSet.has(h.ward_code) ? h.ward_code : null, num(h.lat), num(h.lon), num(h.flood_threshold_mm_per_day), yn(h.tide_sensitive), num(h.avg_water_depth_cm), num(h.avg_recession_hours), yn(h.pumping_station_nearby), num(h.years_flagged_last_5) ?? 0, origin]), upd(cols, 'hotspot_id'));
      counts['flood_hotspots.csv'] = { source_rows: hs.length, imported: hs.length };
    }

    // ---------- complaints (upsert; originals preserved) ----------
    if (has('complaints.csv')) {
      const comp = read('complaints.csv');
      const seen = new Set<string>();
      const rows: unknown[][] = [];
      for (const c of comp) {
        if (!c.complaint_id) { issues.push({ file: 'complaints.csv', severity: 'error', issue_type: 'missing_id', message: 'Row without complaint_id skipped' }); continue; }
        if (seen.has(c.complaint_id)) { issues.push({ file: 'complaints.csv', record_id: c.complaint_id, severity: 'error', issue_type: 'duplicate_id', message: 'Duplicate complaint_id in file' }); continue; }
        seen.add(c.complaint_id);
        if (!c.ward_code) issues.push({ file: 'complaints.csv', record_id: c.complaint_id, severity: 'info', issue_type: 'missing_ward', message: 'Ward is blank (inferred from GPS or locality)' });
        else if (!wardSet.has(c.ward_code)) issues.push({ file: 'complaints.csv', record_id: c.complaint_id, severity: 'error', issue_type: 'unknown_ward', message: `Unknown ward ${c.ward_code}` });
        rows.push([c.complaint_id, ist(c.received_at), c.channel || null, c.category_reported, HIST_CATEGORY_MAP[c.category_reported] ?? null, c.description, c.language || null, c.locality_text || null,
          c.ward_code && wardSet.has(c.ward_code) ? c.ward_code : null, num(c.lat), num(c.lon), num(c.gps_accuracy_m), c.photo_url || null, c.photo_description || null, c.complainant_id || 'anonymous', num(c.upvotes) ?? 0, c.status, ist(c.resolved_at), origin]);
      }
      const cols = ['complaint_id', 'received_at', 'channel', 'category_reported', 'mapped_category', 'description', 'language', 'locality_text', 'ward_code', 'lat', 'lon', 'gps_accuracy_m', 'photo_url', 'photo_description', 'complainant_hash', 'upvotes', 'status', 'resolved_at', 'data_origin'];
      await insertMany(tx, 'hist_complaints', cols, rows, upd(cols, 'complaint_id'));
      counts['complaints.csv'] = { source_rows: comp.length, imported: rows.length };
    }
    if (has('complaints_sample_200.csv')) {
      const sample = read('complaints_sample_200.csv');
      const known = new Set((await tx.query<{ complaint_id: string }>('select complaint_id from hist_complaints where complaint_id = any($1)', [sample.map((s) => s.complaint_id)])).rows.map((r) => r.complaint_id));
      for (const s of sample) if (!known.has(s.complaint_id)) issues.push({ file: 'complaints_sample_200.csv', record_id: s.complaint_id, severity: 'warning', issue_type: 'not_in_full_dataset', message: 'Sample complaint not found in complaints.csv' });
      await tx.query('update hist_complaints set in_sample_200 = true where complaint_id = any($1)', [sample.map((s) => s.complaint_id)]);
      counts['complaints_sample_200.csv'] = { source_rows: sample.length, imported: 0, note: `Deduplicated against complaints.csv: ${known.size} already present, ${sample.length - known.size} not found. Flagged in_sample_200.` };
    }

    // ---------- work orders + links ----------
    if (has('work_orders.csv')) {
      const wos = read('work_orders.csv');
      const rateSet = new Set((await tx.query<{ repair_method: string }>('select repair_method from rate_card')).rows.map((r) => r.repair_method));
      const contractorSet = new Set((await tx.query<{ contractor_id: string }>('select contractor_id from contractors')).rows.map((r) => r.contractor_id));
      const linkedIds = [...new Set(wos.flatMap((w) => (w.linked_complaint_ids ?? '').split('|').map((s) => s.trim()).filter(Boolean)))];
      const comps = new Map((await tx.query<{ complaint_id: string; ward_code: string | null; received_at: Date }>('select complaint_id, ward_code, received_at from hist_complaints where complaint_id = any($1)', [linkedIds])).rows.map((c) => [c.complaint_id, c]));
      const woRows: unknown[][] = []; const linkRows: unknown[][] = []; const seen = new Set<string>();
      let missing = 0, unlinked = 0, slaMismatch = 0;
      for (const w of wos) {
        if (!w.work_order_id || seen.has(w.work_order_id)) { issues.push({ file: 'work_orders.csv', record_id: w.work_order_id, severity: 'error', issue_type: 'duplicate_id', message: 'Missing or duplicate work_order_id' }); continue; }
        if (!wardSet.has(w.ward_code)) { issues.push({ file: 'work_orders.csv', record_id: w.work_order_id, severity: 'error', issue_type: 'unknown_ward', message: `Unknown ward ${w.ward_code}: row skipped` }); continue; }
        if (!rateSet.has(w.repair_method)) { issues.push({ file: 'work_orders.csv', record_id: w.work_order_id, severity: 'error', issue_type: 'unmatched_rate', message: `Repair method not on the rate card: ${w.repair_method}. Row skipped (no baseline to compare).` }); continue; }
        if (!roadSet.has(w.road_id)) issues.push({ file: 'work_orders.csv', record_id: w.work_order_id, severity: 'warning', issue_type: 'unmatched_road', message: `Unknown road ${w.road_id}` });
        if (!contractorSet.has(w.contractor_id)) { issues.push({ file: 'work_orders.csv', record_id: w.work_order_id, severity: 'warning', issue_type: 'unknown_contractor', message: `Contractor ${w.contractor_id} added from this row` });
          await tx.query(`insert into contractors (contractor_id, contractor_name, data_origin) values ($1,$2,$3) on conflict do nothing`, [w.contractor_id, w.contractor_name || w.contractor_id, origin]); contractorSet.add(w.contractor_id); }
        seen.add(w.work_order_id);
        const ids = (w.linked_complaint_ids ?? '').split('|').map((s) => s.trim()).filter(Boolean);
        let first: number | null = null;
        if (!ids.length) { unlinked++; issues.push({ file: 'work_orders.csv', record_id: w.work_order_id, severity: 'warning', issue_type: 'no_linked_complaint', message: 'Work order has no linked complaint (checked by the double-billing audit)' }); }
        for (const id of ids) {
          const c = comps.get(id);
          let status = 'valid';
          if (!c) { status = 'missing_complaint'; missing++; issues.push({ file: 'work_orders.csv', record_id: w.work_order_id, severity: 'error', issue_type: 'missing_linked_complaint', message: `Linked complaint ${id} not found` }); }
          else {
            if (c.ward_code && c.ward_code !== w.ward_code) { status = 'ward_mismatch'; issues.push({ file: 'work_orders.csv', record_id: w.work_order_id, severity: 'warning', issue_type: 'ward_mismatch', message: `Complaint ${id} is in ${c.ward_code}, work order in ${w.ward_code}` }); }
            const t = new Date(c.received_at).getTime();
            if (first === null || t < first) first = t;
          }
          if (status !== 'missing_complaint') linkRows.push([w.work_order_id, id, status]);
        }
        const done = Date.parse(ist(w.completed_at) as string);
        const slaGiven = w.sla_met != null && w.sla_met !== '';
        const slaHours = num(w.sla_hours);
        const computedMet = first !== null && slaHours != null ? (done - first) / 3600_000 <= slaHours : null;
        if (first !== null && slaGiven && computedMet !== null && computedMet !== yn(w.sla_met)) {
          slaMismatch++;
          issues.push({ file: 'work_orders.csv', record_id: w.work_order_id, severity: 'warning', issue_type: 'sla_inconsistent', message: `Recorded sla_met=${w.sla_met} but timestamps give ${((done - first) / 3600_000).toFixed(1)} h against ${slaHours} h`, data: { hours: (done - first) / 3600_000, sla_hours: slaHours } });
        }
        woRows.push([w.work_order_id, w.ward_code, roadSet.has(w.road_id) ? w.road_id : null, w.work_type, w.repair_method, w.contractor_id, w.contractor_name || null,
          ist(w.assigned_at), ist(w.work_started_at || w.assigned_at), ist(w.completed_at), num(w.area_sqm) ?? 0, num(w.cost_inr), slaHours ?? 72, slaGiven ? yn(w.sla_met) : (computedMet ?? true), yn(w.reopened_within_30d), w.engineer_remark || null, w.linked_complaint_ids || null, origin]);
      }
      const cols = ['work_order_id', 'ward_code', 'road_id', 'work_type', 'repair_method', 'contractor_id', 'contractor_name', 'assigned_at', 'work_started_at', 'completed_at', 'area_sqm', 'cost_inr', 'sla_hours', 'sla_met', 'reopened_within_30d', 'engineer_remark', 'linked_complaint_ids_raw', 'data_origin'];
      await insertMany(tx, 'hist_work_orders', cols, woRows, upd(cols, 'work_order_id'));
      await tx.query('delete from hist_work_order_complaints where work_order_id = any($1)', [[...seen]]);
      await insertMany(tx, 'hist_work_order_complaints', ['work_order_id', 'complaint_id', 'link_status'], linkRows, 'on conflict do nothing');
      counts['work_orders.csv'] = { source_rows: wos.length, imported: woRows.length, note: `${linkRows.length} complaint links (${missing} missing), ${unlinked} with no linked complaint, ${slaMismatch} with a recorded SLA result inconsistent with timestamps` };
    }

    if (has('accidents.csv')) {
      const acc = read('accidents.csv');
      const cols = ['accident_id', 'occurred_at', 'ward_code', 'road_id', 'lat', 'lon', 'vehicle_type', 'severity', 'probable_cause', 'data_origin'];
      await insertMany(tx, 'hist_accidents', cols, acc.map((a) => [a.accident_id, ist(a.occurred_at), wardSet.has(a.ward_code) ? a.ward_code : null, roadSet.has(a.road_id) ? a.road_id : null, num(a.lat), num(a.lon), a.vehicle_type || null, a.severity || null, a.probable_cause || null, origin]), upd(cols, 'accident_id'));
      for (const a of acc) if (a.road_id && !roadSet.has(a.road_id)) issues.push({ file: 'accidents.csv', record_id: a.accident_id, severity: 'warning', issue_type: 'unmatched_road', message: `Unknown road ${a.road_id}` });
      counts['accidents.csv'] = { source_rows: acc.length, imported: acc.length };
    }
    if (has('rainfall_daily.csv')) {
      const rain = read('rainfall_daily.csv');
      await insertMany(tx, 'hist_rainfall', ['date', 'station', 'rainfall_mm', 'imd_category', 'imd_alert', 'data_origin'], rain.map((r) => [r.date, r.station, num(r.rainfall_mm), r.imd_category || null, r.imd_alert || null, origin]),
        'on conflict (date, station) do update set rainfall_mm=excluded.rainfall_mm, imd_category=excluded.imd_category, imd_alert=excluded.imd_alert, data_origin=excluded.data_origin');
      counts['rainfall_daily.csv'] = { source_rows: rain.length, imported: rain.length };
    }
    if (has('tides.csv')) {
      const tides = read('tides.csv');
      await tx.query('delete from hist_tides where date = any($1::date[])', [[...new Set(tides.map((t) => t.date))]]);
      await insertMany(tx, 'hist_tides', ['date', 'high_tide_time', 'height_m', 'big_tide', 'data_origin'], tides.map((t) => [t.date, t.high_tide_time || null, num(t.height_m), t.big_tide_flag ? yn(t.big_tide_flag) : (num(t.height_m) ?? 0) >= 4.5, origin]));
      counts['tides.csv'] = { source_rows: tides.length, imported: tides.length };
    }
    if (has('social_posts.csv')) {
      const posts = read('social_posts.csv');
      await insertMany(tx, 'social_posts', ['post_id', 'posted_at', 'source', 'author_handle', 'text', 'has_media', 'engagement', 'data_origin'],
        posts.map((p) => [p.post_id, ist(p.posted_at), p.source || null, p.author_handle || null, p.text, yn(p.has_media), num(p.likes_or_forwards), origin]),
        'on conflict (post_id) do update set posted_at=excluded.posted_at, source=excluded.source, author_handle=excluded.author_handle, text=excluded.text, has_media=excluded.has_media, engagement=excluded.engagement');
      counts['social_posts.csv'] = { source_rows: posts.length, imported: posts.length };
    }

    // Complaints marked Resolved with no work order are worth a look (recomputed over all data).
    const rnw = (await tx.query<{ complaint_id: string }>(`select complaint_id from hist_complaints c where status = 'Resolved' and not exists (select 1 from hist_work_order_complaints l where l.complaint_id = c.complaint_id)`)).rows;
    for (const r of rnw) issues.push({ file: 'complaints.csv', record_id: r.complaint_id, severity: 'warning', issue_type: 'resolved_without_work_order', message: 'Marked Resolved but no work order links to it' });

    await ensureConfig(tx);
    // Keep one current validation report per file: replace earlier issues for the files ingested now.
    await tx.query(`delete from import_issues where file = any($1) or issue_type = 'resolved_without_work_order'`, [[...files]]);
    await insertMany(tx, 'import_issues', ['run_id', 'file', 'record_id', 'severity', 'issue_type', 'message', 'data'],
      issues.map((i) => [run.id, i.file, i.record_id ?? null, i.severity, i.issue_type, i.message, i.data ? JSON.stringify(i.data) : null]));
    await tx.query(`update import_runs set finished_at = now(), status = 'completed', row_counts = $2, notes = $3 where id = $1`,
      [run.id, JSON.stringify(counts), `${origin}: ${files.length} file(s); ${rnw.length} resolved complaints without a work order`]);
  });
  return { runId: run.id, counts, issues, files: [...files] };
}

/** Departments, categories, default routing and SLA policy v1: only fills gaps, admins' edits survive. */
export async function ensureConfig(tx: Queryable) {
  for (const d of DEPARTMENTS) {
    await tx.query(`insert into departments (code, name, short_name, description) values ($1,$2,$3,$4) on conflict (code) do update set name=excluded.name, short_name=excluded.short_name, description=excluded.description`, [d.code, d.name, d.short, d.description]);
  }
  for (const [i, c] of CATEGORIES.entries()) {
    await tx.query(`insert into categories (code, label, primary_department, urgency_guidance, evidence_required, closure_check, photo_required_for_closure, sort)
      values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (code) do update set label=excluded.label, urgency_guidance=excluded.urgency_guidance,
      evidence_required=excluded.evidence_required, closure_check=excluded.closure_check, photo_required_for_closure=excluded.photo_required_for_closure, sort=excluded.sort`,
      [c.code, c.label, c.primaryDepartment, c.urgencyGuidance, c.evidenceRequired, c.closureCheck, c.photoRequiredForClosure, i]);
  }
  for (const r of DEFAULT_ROUTING) {
    await tx.query(`insert into routing_rules (ward_code, category_code, primary_department, supporting_departments, note)
      select null, $1, $2, $3, 'Seeded city-wide default' where not exists (select 1 from routing_rules where ward_code is null and category_code = $1 and active)`, [r.category, r.primary, r.supporting]);
  }
  for (const p of SLA_POLICY_V1) {
    await tx.query(`insert into sla_policies (version, priority, label, first_action_hours, reminder_hours, resolution_hours, alert_on_submit, note)
      values (1,$1,$2,$3,$4,$5,$6,$7) on conflict (version, priority) do nothing`, [p.priority, p.label, p.firstActionHours, p.reminderHours, p.resolutionHours, p.alertOnSubmit, p.note]);
  }
}
