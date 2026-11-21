// Repeatable import of the organiser's dataset (all 17 files) plus configuration and demo seed.
// Usage:
//   npm run db:import            # migrate + import + seed (idempotent; keeps operational tickets)
//   npm run db:reset             # wipe the local PGlite database first, then import + seed
// Env: DATA_REPO (default ../Claude-Impact-Labs-data-2), DATABASE_URL (optional hosted Postgres)
// The organiser's repository is only read, never written.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openDb, runMigrations, defaultDataDir, setDb, type Db, type Queryable } from '../src/lib/db.ts';
import { parseCsv } from '../src/lib/csv.ts';
import { CATEGORIES, DEPARTMENTS, DEFAULT_ROUTING, SLA_POLICY_V1, HIST_CATEGORY_MAP } from '../src/lib/config.ts';
import { seedDemo } from '../src/lib/demo-seed.ts';

const ROOT = process.cwd();
const REPO = path.resolve(process.env.DATA_REPO || path.join(ROOT, '..', 'Claude-Impact-Labs-data-2'));
const DATA = path.join(REPO, 'data');
const args = new Set(process.argv.slice(2));

const FILES = [
  'wards.csv', 'wards.geojson', 'localities.csv', 'roads.csv', 'roads.geojson', 'complaints.csv',
  'complaints_sample_200.csv', 'work_orders.csv', 'contractors.csv', 'rate_card.csv', 'traffic.csv',
  'accidents.csv', 'facilities.csv', 'flood_hotspots.csv', 'rainfall_daily.csv', 'tides.csv', 'social_posts.csv',
];

type Issue = { file: string; record_id?: string; severity: 'error' | 'warning' | 'info'; issue_type: string; message: string; data?: unknown };

const ist = (s: string) => (s ? `${s.length === 10 ? s + ' 00:00' : s}:00+05:30`.replace(' ', 'T') : null);
const num = (s: string) => (s === '' || s == null ? null : Number(s));
const yn = (s: string) => s === 'Y';

function readCsv(file: string) {
  return parseCsv(fs.readFileSync(path.join(DATA, file), 'utf8'));
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

async function main() {
  const t0 = Date.now();
  if (!fs.existsSync(DATA)) throw new Error(`Dataset not found at ${DATA}. Clone it next to this project or set DATA_REPO.`);
  for (const f of FILES) if (!fs.existsSync(path.join(DATA, f))) throw new Error(`Missing source file ${f}`);

  if (!process.env.DATABASE_URL) {
    const lock = `${defaultDataDir()}.lock`;
    if (fs.existsSync(lock) && !args.has('--force')) {
      const pid = Number(fs.readFileSync(lock, 'utf8'));
      let alive = false;
      try { process.kill(pid, 0); alive = true; } catch { /* not running */ }
      if (alive) throw new Error(`The CivicOps server (pid ${pid}) is using this database. Stop it first: two processes must not open the same PGlite folder.`);
    }
  }
  if (args.has('--reset') && !process.env.DATABASE_URL) {
    fs.rmSync(defaultDataDir(), { recursive: true, force: true });
    fs.rmSync(process.env.STORAGE_DIR || path.join(ROOT, '.data', 'uploads'), { recursive: true, force: true });
    console.log('Local database and uploads cleared.');
  }

  const db: Db = await openDb();
  setDb(db); // one PGlite instance per process: never open the same data folder twice
  const applied = await runMigrations(db);
  console.log(`Migrations applied: ${applied.length ? applied.join(', ') : 'none (up to date)'}`);

  let commit = 'unknown';
  try { commit = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a git checkout */ }
  const run = (await db.query<{ id: number }>(
    `insert into import_runs (source_repo, source_commit) values ($1, $2) returning id`,
    ['https://github.com/SumeetGDoshi/Claude-Impact-Labs-data-2', commit],
  )).rows[0];

  const issues: Issue[] = [];
  const counts: Record<string, { source_rows: number; imported: number; note?: string }> = {};

  await db.transaction(async (tx) => {
    await tx.query(`select set_config('app.role', 'system', true)`);

    // ---------- wards + boundaries ----------
    const wards = readCsv('wards.csv').rows;
    const geo = JSON.parse(fs.readFileSync(path.join(DATA, 'wards.geojson'), 'utf8'));
    const shapes = new Map<string, unknown>();
    for (const f of geo.features) shapes.set(f.properties.ward_code, f.geometry);
    for (const w of wards) {
      if (!shapes.has(w.ward_code)) issues.push({ file: 'wards.geojson', record_id: w.ward_code, severity: 'error', issue_type: 'missing_boundary', message: `No polygon for ward ${w.ward_code}` });
      await tx.query(
        `insert into wards (ward_code, ward_name, zone, office_name, centroid_lat, centroid_lon, approx_area_km2, population_est,
           low_lying_index, engineering_crews, localities_text, budget_inr_2025, boundary_geojson)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         on conflict (ward_code) do update set ward_name=excluded.ward_name, zone=excluded.zone, office_name=excluded.office_name,
           centroid_lat=excluded.centroid_lat, centroid_lon=excluded.centroid_lon, approx_area_km2=excluded.approx_area_km2,
           population_est=excluded.population_est, low_lying_index=excluded.low_lying_index, engineering_crews=excluded.engineering_crews,
           localities_text=excluded.localities_text, budget_inr_2025=excluded.budget_inr_2025, boundary_geojson=excluded.boundary_geojson`,
        [w.ward_code, w.ward_name, w.zone, w.assistant_commissioner_office, num(w.centroid_lat), num(w.centroid_lon), num(w.approx_area_km2),
          num(w.population_est), num(w.low_lying_index), num(w.engineering_crews), w.localities, num(w.monsoon_repair_budget_inr_2025),
          JSON.stringify(shapes.get(w.ward_code) ?? null)],
      );
    }
    for (const code of shapes.keys()) if (!wards.find((w) => w.ward_code === code)) issues.push({ file: 'wards.geojson', record_id: code, severity: 'warning', issue_type: 'unknown_ward', message: `Polygon for unknown ward ${code}` });
    counts['wards.csv'] = { source_rows: wards.length, imported: wards.length };
    counts['wards.geojson'] = { source_rows: geo.features.length, imported: shapes.size };
    const wardSet = new Set(wards.map((w) => w.ward_code));

    // ---------- localities ----------
    const locs = readCsv('localities.csv').rows;
    await tx.query('delete from localities');
    await insertMany(tx, 'localities', ['name', 'ward_code', 'lat', 'lon', 'aliases', 'aliases_raw'],
      locs.map((l) => [l.locality, l.ward_code, num(l.lat), num(l.lon), l.aliases ? l.aliases.split(';').map((a) => a.trim()).filter(Boolean) : [], l.aliases || null]));
    for (const l of locs) if (!wardSet.has(l.ward_code)) issues.push({ file: 'localities.csv', record_id: l.locality, severity: 'error', issue_type: 'unknown_ward', message: `Unknown ward ${l.ward_code}` });
    counts['localities.csv'] = { source_rows: locs.length, imported: locs.length };

    // ---------- roads + geometry ----------
    const roads = readCsv('roads.csv').rows;
    const rgeo = JSON.parse(fs.readFileSync(path.join(DATA, 'roads.geojson'), 'utf8'));
    const rshape = new Map<string, unknown>();
    for (const f of rgeo.features) rshape.set(f.properties.road_id, f.geometry);
    await insertMany(tx, 'roads', ['road_id', 'road_name', 'segment_no', 'ward_code', 'road_type', 'surface', 'lanes', 'length_m', 'start_lat', 'start_lon', 'end_lat', 'end_lon', 'last_resurfaced', 'under_dlp', 'bus_route', 'geometry'],
      roads.map((r) => [r.road_id, r.road_name, num(r.segment_no), r.ward_code, r.road_type, r.surface, num(r.lanes), num(r.length_m), num(r.start_lat), num(r.start_lon), num(r.end_lat), num(r.end_lon), r.last_resurfaced || null, yn(r.under_dlp), yn(r.bus_route), JSON.stringify(rshape.get(r.road_id) ?? null)]),
      `on conflict (road_id) do update set road_name=excluded.road_name, segment_no=excluded.segment_no, ward_code=excluded.ward_code, road_type=excluded.road_type,
        surface=excluded.surface, lanes=excluded.lanes, length_m=excluded.length_m, start_lat=excluded.start_lat, start_lon=excluded.start_lon, end_lat=excluded.end_lat,
        end_lon=excluded.end_lon, last_resurfaced=excluded.last_resurfaced, under_dlp=excluded.under_dlp, bus_route=excluded.bus_route, geometry=excluded.geometry`);
    for (const r of roads) if (!rshape.has(r.road_id)) issues.push({ file: 'roads.geojson', record_id: r.road_id, severity: 'warning', issue_type: 'missing_geometry', message: 'Road has no line geometry' });
    counts['roads.csv'] = { source_rows: roads.length, imported: roads.length };
    counts['roads.geojson'] = { source_rows: rgeo.features.length, imported: rshape.size };
    const roadSet = new Set(roads.map((r) => r.road_id));

    const traffic = readCsv('traffic.csv').rows;
    await insertMany(tx, 'road_traffic', ['road_id', 'peak_hour_vehicles', 'avg_peak_speed_kmph', 'congestion_index', 'bus_routes_count', 'two_wheeler_share_pct'],
      traffic.filter((t) => roadSet.has(t.road_id)).map((t) => [t.road_id, num(t.peak_hour_vehicles), num(t.avg_peak_speed_kmph), num(t.congestion_index_0_10), num(t.bus_routes_count), num(t.two_wheeler_share_pct)]),
      `on conflict (road_id) do update set peak_hour_vehicles=excluded.peak_hour_vehicles, avg_peak_speed_kmph=excluded.avg_peak_speed_kmph,
        congestion_index=excluded.congestion_index, bus_routes_count=excluded.bus_routes_count, two_wheeler_share_pct=excluded.two_wheeler_share_pct`);
    for (const t of traffic) if (!roadSet.has(t.road_id)) issues.push({ file: 'traffic.csv', record_id: t.road_id, severity: 'error', issue_type: 'unmatched_road', message: 'Traffic row for unknown road' });
    counts['traffic.csv'] = { source_rows: traffic.length, imported: traffic.filter((t) => roadSet.has(t.road_id)).length };

    // ---------- contractors, rate card ----------
    const contractors = readCsv('contractors.csv').rows;
    await insertMany(tx, 'contractors', ['contractor_id', 'contractor_name', 'empanelled_since', 'active_wards'],
      contractors.map((c) => [c.contractor_id, c.contractor_name, num(c.empanelled_since), c.active_wards.split(';').map((s) => s.trim()).filter(Boolean)]),
      `on conflict (contractor_id) do update set contractor_name=excluded.contractor_name, empanelled_since=excluded.empanelled_since, active_wards=excluded.active_wards`);
    counts['contractors.csv'] = { source_rows: contractors.length, imported: contractors.length };
    const rates = readCsv('rate_card.csv').rows;
    await insertMany(tx, 'rate_card', ['repair_method', 'unit', 'standard_rate_inr'], rates.map((r) => [r.repair_method, r.unit, num(r.standard_rate_inr)]),
      `on conflict (repair_method) do update set unit=excluded.unit, standard_rate_inr=excluded.standard_rate_inr`);
    counts['rate_card.csv'] = { source_rows: rates.length, imported: rates.length };

    // ---------- facilities, hotspots ----------
    const fac = readCsv('facilities.csv').rows;
    await insertMany(tx, 'facilities', ['facility_id', 'type', 'name', 'ward_code', 'lat', 'lon', 'beds_or_students', 'emergency_services', 'ambulance_entry_road'],
      fac.map((f) => [f.facility_id, f.type, f.name, wardSet.has(f.ward_code) ? f.ward_code : null, num(f.lat), num(f.lon), num(f.beds_or_students), yn(f.emergency_services), roadSet.has(f.ambulance_entry_road) ? f.ambulance_entry_road : null]),
      `on conflict (facility_id) do update set type=excluded.type, name=excluded.name, ward_code=excluded.ward_code, lat=excluded.lat, lon=excluded.lon,
        beds_or_students=excluded.beds_or_students, emergency_services=excluded.emergency_services, ambulance_entry_road=excluded.ambulance_entry_road`);
    for (const f of fac) if (f.ambulance_entry_road && !roadSet.has(f.ambulance_entry_road)) issues.push({ file: 'facilities.csv', record_id: f.facility_id, severity: 'warning', issue_type: 'unmatched_road', message: `Ambulance entry road ${f.ambulance_entry_road} not in roads.csv` });
    counts['facilities.csv'] = { source_rows: fac.length, imported: fac.length };
    const hs = readCsv('flood_hotspots.csv').rows;
    await insertMany(tx, 'flood_hotspots', ['hotspot_id', 'name', 'ward_code', 'lat', 'lon', 'flood_threshold_mm', 'tide_sensitive', 'avg_water_depth_cm', 'avg_recession_hours', 'pumping_station_nearby', 'years_flagged_last_5'],
      hs.map((h) => [h.hotspot_id, h.name, h.ward_code, num(h.lat), num(h.lon), num(h.flood_threshold_mm_per_day), yn(h.tide_sensitive), num(h.avg_water_depth_cm), num(h.avg_recession_hours), yn(h.pumping_station_nearby), num(h.years_flagged_last_5)]),
      `on conflict (hotspot_id) do update set name=excluded.name, ward_code=excluded.ward_code, lat=excluded.lat, lon=excluded.lon, flood_threshold_mm=excluded.flood_threshold_mm,
        tide_sensitive=excluded.tide_sensitive, avg_water_depth_cm=excluded.avg_water_depth_cm, avg_recession_hours=excluded.avg_recession_hours,
        pumping_station_nearby=excluded.pumping_station_nearby, years_flagged_last_5=excluded.years_flagged_last_5`);
    counts['flood_hotspots.csv'] = { source_rows: hs.length, imported: hs.length };

    // ---------- historical complaints (+ sample dedupe) ----------
    await tx.query('delete from hist_work_order_complaints');
    await tx.query('delete from hist_work_orders');
    await tx.query('delete from hist_complaints');
    const comp = readCsv('complaints.csv').rows;
    const compIds = new Set<string>();
    const compById = new Map<string, Record<string, string>>();
    let compDup = 0;
    const compRows: unknown[][] = [];
    for (const c of comp) {
      if (compIds.has(c.complaint_id)) { compDup++; issues.push({ file: 'complaints.csv', record_id: c.complaint_id, severity: 'error', issue_type: 'duplicate_id', message: 'Duplicate complaint_id' }); continue; }
      compIds.add(c.complaint_id); compById.set(c.complaint_id, c);
      if (!c.ward_code) issues.push({ file: 'complaints.csv', record_id: c.complaint_id, severity: 'info', issue_type: 'missing_ward', message: 'Ward is blank (resolved via locality or GPS in review)' });
      else if (!wardSet.has(c.ward_code)) issues.push({ file: 'complaints.csv', record_id: c.complaint_id, severity: 'error', issue_type: 'unknown_ward', message: `Unknown ward ${c.ward_code}` });
      compRows.push([c.complaint_id, ist(c.received_at), c.channel, c.category_reported, HIST_CATEGORY_MAP[c.category_reported] ?? null, c.description, c.language, c.locality_text,
        c.ward_code || null, num(c.lat), num(c.lon), num(c.gps_accuracy_m), c.photo_url || null, c.photo_description || null, c.complainant_id, num(c.upvotes) ?? 0, c.status, ist(c.resolved_at)]);
    }
    await insertMany(tx, 'hist_complaints', ['complaint_id', 'received_at', 'channel', 'category_reported', 'mapped_category', 'description', 'language', 'locality_text', 'ward_code', 'lat', 'lon', 'gps_accuracy_m', 'photo_url', 'photo_description', 'complainant_hash', 'upvotes', 'status', 'resolved_at'], compRows);
    counts['complaints.csv'] = { source_rows: comp.length, imported: compRows.length, note: compDup ? `${compDup} duplicate ids skipped` : undefined };

    const sample = readCsv('complaints_sample_200.csv').rows;
    let identical = 0, differing = 0, newOnes = 0;
    for (const s of sample) {
      const full = compById.get(s.complaint_id);
      if (!full) { newOnes++; issues.push({ file: 'complaints_sample_200.csv', record_id: s.complaint_id, severity: 'warning', issue_type: 'not_in_full_dataset', message: 'Sample complaint not found in complaints.csv' }); continue; }
      const same = Object.keys(s).every((k) => s[k] === full[k]);
      if (same) identical++; else { differing++; issues.push({ file: 'complaints_sample_200.csv', record_id: s.complaint_id, severity: 'warning', issue_type: 'sample_differs', message: 'Sample row differs from the full dataset; full dataset kept' }); }
    }
    await tx.query(`update hist_complaints set in_sample_200 = true where complaint_id = any($1)`, [sample.map((s) => s.complaint_id)]);
    counts['complaints_sample_200.csv'] = { source_rows: sample.length, imported: 0, note: `Deduplicated against complaints.csv: ${identical} identical, ${differing} differing, ${newOnes} not in full set. Flagged in_sample_200 for QA fixtures.` };

    // ---------- work orders + links ----------
    const wos = readCsv('work_orders.csv').rows;
    const rateSet = new Set(rates.map((r) => r.repair_method));
    const woRows: unknown[][] = [];
    const linkRows: unknown[][] = [];
    const woSeen = new Set<string>();
    let missingLinks = 0, unlinked = 0, slaMismatch = 0;
    for (const w of wos) {
      if (woSeen.has(w.work_order_id)) { issues.push({ file: 'work_orders.csv', record_id: w.work_order_id, severity: 'error', issue_type: 'duplicate_id', message: 'Duplicate work_order_id' }); continue; }
      woSeen.add(w.work_order_id);
      if (!roadSet.has(w.road_id)) issues.push({ file: 'work_orders.csv', record_id: w.work_order_id, severity: 'error', issue_type: 'unmatched_road', message: `Unknown road ${w.road_id}` });
      if (!rateSet.has(w.repair_method)) issues.push({ file: 'work_orders.csv', record_id: w.work_order_id, severity: 'error', issue_type: 'unmatched_rate', message: `Repair method not on rate card: ${w.repair_method}` });
      woRows.push([w.work_order_id, w.ward_code, roadSet.has(w.road_id) ? w.road_id : null, w.work_type, rateSet.has(w.repair_method) ? w.repair_method : null, w.contractor_id, w.contractor_name,
        ist(w.assigned_at), ist(w.work_started_at), ist(w.completed_at), num(w.area_sqm), num(w.cost_inr), num(w.sla_hours), yn(w.sla_met), yn(w.reopened_within_30d), w.engineer_remark || null, w.linked_complaint_ids || null]);
      const ids = w.linked_complaint_ids.split('|').map((s) => s.trim()).filter(Boolean);
      if (!ids.length) { unlinked++; issues.push({ file: 'work_orders.csv', record_id: w.work_order_id, severity: 'warning', issue_type: 'no_linked_complaint', message: 'Work order has no linked complaint (checked by the double-billing audit)' }); }
      let firstReceived: number | null = null;
      for (const id of ids) {
        const c = compById.get(id);
        let status = 'valid';
        if (!c) { status = 'missing_complaint'; missingLinks++; issues.push({ file: 'work_orders.csv', record_id: w.work_order_id, severity: 'error', issue_type: 'missing_linked_complaint', message: `Linked complaint ${id} not found` }); }
        else {
          if (c.ward_code && c.ward_code !== w.ward_code) { status = 'ward_mismatch'; issues.push({ file: 'work_orders.csv', record_id: w.work_order_id, severity: 'warning', issue_type: 'ward_mismatch', message: `Complaint ${id} is in ${c.ward_code}, work order in ${w.ward_code}` }); }
          const t = Date.parse(ist(c.received_at) as string);
          if (firstReceived === null || t < firstReceived) firstReceived = t;
        }
        linkRows.push([w.work_order_id, id, status]);
      }
      if (firstReceived !== null) {
        const hours = (Date.parse(ist(w.completed_at) as string) - firstReceived) / 3600_000;
        const computedMet = hours <= Number(w.sla_hours);
        if (computedMet !== yn(w.sla_met)) {
          slaMismatch++;
          issues.push({ file: 'work_orders.csv', record_id: w.work_order_id, severity: 'warning', issue_type: 'sla_inconsistent', message: `Recorded sla_met=${w.sla_met} but first complaint to completion took ${hours.toFixed(1)} h against ${w.sla_hours} h`, data: { hours, sla_hours: Number(w.sla_hours) } });
        }
      }
    }
    await insertMany(tx, 'hist_work_orders', ['work_order_id', 'ward_code', 'road_id', 'work_type', 'repair_method', 'contractor_id', 'contractor_name', 'assigned_at', 'work_started_at', 'completed_at', 'area_sqm', 'cost_inr', 'sla_hours', 'sla_met', 'reopened_within_30d', 'engineer_remark', 'linked_complaint_ids_raw'], woRows);
    await insertMany(tx, 'hist_work_order_complaints', ['work_order_id', 'complaint_id', 'link_status'], linkRows, 'on conflict do nothing');
    counts['work_orders.csv'] = { source_rows: wos.length, imported: woRows.length, note: `${linkRows.length} complaint links (${missingLinks} missing), ${unlinked} with no linked complaint, ${slaMismatch} with recorded SLA result inconsistent with timestamps` };

    // Complaints marked Resolved with no work order are worth a look.
    const linked = new Set(linkRows.map((l) => l[1] as string));
    let resolvedNoWo = 0;
    for (const c of comp) if (c.status === 'Resolved' && !linked.has(c.complaint_id)) { resolvedNoWo++; issues.push({ file: 'complaints.csv', record_id: c.complaint_id, severity: 'warning', issue_type: 'resolved_without_work_order', message: 'Marked Resolved but no work order links to it' }); }

    // ---------- accidents, rain, tides ----------
    const acc = readCsv('accidents.csv').rows;
    await tx.query('delete from hist_accidents');
    await insertMany(tx, 'hist_accidents', ['accident_id', 'occurred_at', 'ward_code', 'road_id', 'lat', 'lon', 'vehicle_type', 'severity', 'probable_cause'],
      acc.map((a) => [a.accident_id, ist(a.occurred_at), wardSet.has(a.ward_code) ? a.ward_code : null, roadSet.has(a.road_id) ? a.road_id : null, num(a.lat), num(a.lon), a.vehicle_type, a.severity, a.probable_cause]));
    for (const a of acc) if (a.road_id && !roadSet.has(a.road_id)) issues.push({ file: 'accidents.csv', record_id: a.accident_id, severity: 'warning', issue_type: 'unmatched_road', message: `Unknown road ${a.road_id}` });
    counts['accidents.csv'] = { source_rows: acc.length, imported: acc.length };
    const rain = readCsv('rainfall_daily.csv').rows;
    await tx.query('delete from hist_rainfall');
    await insertMany(tx, 'hist_rainfall', ['date', 'station', 'rainfall_mm', 'imd_category', 'imd_alert'], rain.map((r) => [r.date, r.station, num(r.rainfall_mm), r.imd_category, r.imd_alert]));
    counts['rainfall_daily.csv'] = { source_rows: rain.length, imported: rain.length };
    const tides = readCsv('tides.csv').rows;
    await tx.query('delete from hist_tides');
    await insertMany(tx, 'hist_tides', ['date', 'high_tide_time', 'height_m', 'big_tide'], tides.map((t) => [t.date, t.high_tide_time, num(t.height_m), yn(t.big_tide_flag)]));
    counts['tides.csv'] = { source_rows: tides.length, imported: tides.length };

    // ---------- social posts (unverified signals; keep staff review fields on re-import) ----------
    const posts = readCsv('social_posts.csv').rows;
    await insertMany(tx, 'social_posts', ['post_id', 'posted_at', 'source', 'author_handle', 'text', 'has_media', 'engagement'],
      posts.map((p) => [p.post_id, ist(p.posted_at), p.source, p.author_handle, p.text, yn(p.has_media), num(p.likes_or_forwards)]),
      `on conflict (post_id) do update set posted_at=excluded.posted_at, source=excluded.source, author_handle=excluded.author_handle, text=excluded.text, has_media=excluded.has_media, engagement=excluded.engagement`);
    counts['social_posts.csv'] = { source_rows: posts.length, imported: posts.length };

    // ---------- configuration (only fills gaps; admins' edits survive re-import) ----------
    for (const d of DEPARTMENTS) {
      await tx.query(`insert into departments (code, name, short_name, description) values ($1,$2,$3,$4)
        on conflict (code) do update set name=excluded.name, short_name=excluded.short_name, description=excluded.description`, [d.code, d.name, d.short, d.description]);
    }
    for (const [i, c] of CATEGORIES.entries()) {
      await tx.query(`insert into categories (code, label, primary_department, urgency_guidance, evidence_required, closure_check, photo_required_for_closure, sort)
        values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (code) do update set label=excluded.label, urgency_guidance=excluded.urgency_guidance,
        evidence_required=excluded.evidence_required, closure_check=excluded.closure_check, photo_required_for_closure=excluded.photo_required_for_closure, sort=excluded.sort`,
        [c.code, c.label, c.primaryDepartment, c.urgencyGuidance, c.evidenceRequired, c.closureCheck, c.photoRequiredForClosure, i]);
    }
    for (const r of DEFAULT_ROUTING) {
      await tx.query(`insert into routing_rules (ward_code, category_code, primary_department, supporting_departments, note)
        select null, $1, $2, $3, 'Seeded city-wide default' where not exists (select 1 from routing_rules where ward_code is null and category_code = $1 and active)`,
        [r.category, r.primary, r.supporting]);
    }
    for (const p of SLA_POLICY_V1) {
      await tx.query(`insert into sla_policies (version, priority, label, first_action_hours, reminder_hours, resolution_hours, alert_on_submit, note)
        values (1,$1,$2,$3,$4,$5,$6,$7) on conflict (version, priority) do nothing`,
        [p.priority, p.label, p.firstActionHours, p.reminderHours, p.resolutionHours, p.alertOnSubmit, p.note]);
    }

    await insertMany(tx, 'import_issues', ['run_id', 'file', 'record_id', 'severity', 'issue_type', 'message', 'data'],
      issues.map((i) => [run.id, i.file, i.record_id ?? null, i.severity, i.issue_type, i.message, i.data ? JSON.stringify(i.data) : null]));
    await tx.query(`delete from import_issues where run_id <> $1`, [run.id]);
    await tx.query(`update import_runs set finished_at = now(), status = 'completed', row_counts = $2,
      notes = $3 where id = $1`, [run.id, JSON.stringify(counts), `${resolvedNoWo} resolved complaints without a work order`]);
  });

  const demo = await seedDemo(db, { repoCommit: commit });
  console.log(demo.message);

  // ---------- report ----------
  const byType = new Map<string, { severity: string; file: string; n: number; example: string }>();
  for (const i of issues) {
    const k = `${i.file}|${i.issue_type}`;
    const e = byType.get(k) ?? { severity: i.severity, file: i.file, n: 0, example: `${i.record_id ?? ''}: ${i.message}` };
    e.n++; byType.set(k, e);
  }
  const lines = [
    '# Import validation report', '',
    `Generated by \`npm run db:import\` on ${new Date().toISOString()} (UTC).`, '',
    `- Source: https://github.com/SumeetGDoshi/Claude-Impact-Labs-data-2 (read-only)`,
    `- Commit: \`${commit}\``,
    `- Database: ${db.kind === 'pglite' ? 'PGlite (local, .data/pgdata)' : 'PostgreSQL (DATABASE_URL)'}`,
    `- Duration: ${((Date.now() - t0) / 1000).toFixed(1)} s`, '',
    'All records are **synthetic** (see the dataset README). Imported rows carry `data_origin = synthetic_repo`; ward polygons carry `boundary_origin = synthetic_voronoi`.', '',
    '## Row counts', '', '| File | Source rows | Imported | Note |', '|---|---:|---:|---|',
    ...FILES.map((f) => `| ${f} | ${counts[f]?.source_rows ?? '—'} | ${counts[f]?.imported ?? '—'} | ${counts[f]?.note ?? ''} |`), '',
    '## Validation issues', '', '| File | Issue | Severity | Count | Example |', '|---|---|---|---:|---|',
    ...[...byType.entries()].map(([k, v]) => `| ${v.file} | ${k.split('|')[1]} | ${v.severity} | ${v.n} | ${v.example.replace(/\|/g, '/')} |`), '',
    'Every issue is also stored in the `import_issues` table and shown in Admin → Data quality.', '',
  ];
  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'IMPORT_REPORT.md'), lines.join('\n'));
  console.log(lines.slice(9, 9 + FILES.length + 4).join('\n'));
  console.log(`Issues: ${issues.length}. Report written to docs/IMPORT_REPORT.md`);
  await db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
