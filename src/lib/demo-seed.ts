// Demo accounts and a small set of operational tickets in different states, created through the
// same service functions the app uses (so history, notifications and SLA fields are realistic).
// Seeded tickets carry data_origin = 'demo_seed' and are labelled in the UI.
import { withSystem, type Actor, type Db } from './db.ts';
import { hashPassword } from './auth-core.ts';
import { createTicket, performAction, runSlaSweep } from './tickets.ts';
import { illustration, saveEvidence } from './evidence.ts';
import { openFlagCases, runCaseSweep, seedCaseExamples } from './cases.ts';

export const DEMO_PASSWORD = 'CivicOps@2026';

export const DEMO_USERS: { email: string; name: string; role: Actor['role']; memberships?: { ward: string; dept: string | null; role: 'officer' | 'ward_admin' }[]; blurb: string }[] = [
  { email: 'asha@civicops.demo', name: 'Asha Kulkarni', role: 'resident', blurb: 'Resident in Juhu (K/W)' },
  { email: 'ravi@civicops.demo', name: 'Ravi Menon', role: 'resident', blurb: 'Resident in Andheri East (K/E)' },
  { email: 'neha@civicops.demo', name: 'Neha Shah', role: 'resident', blurb: 'Resident in Andheri West (K/W)' },
  { email: 'kw.officer@civicops.demo', name: 'Rahul Patil', role: 'officer', memberships: [{ ward: 'K/W', dept: null, role: 'officer' }], blurb: 'Ward officer, K/W, all departments' },
  { email: 'kw.swm@civicops.demo', name: 'Sunita Jadhav', role: 'officer', memberships: [{ ward: 'K/W', dept: 'SWM', role: 'officer' }], blurb: 'Solid waste officer, K/W only' },
  { email: 'kw.admin@civicops.demo', name: 'Meera Iyer', role: 'ward_admin', memberships: [{ ward: 'K/W', dept: null, role: 'ward_admin' }], blurb: 'Ward admin, K/W' },
  { email: 'ke.officer@civicops.demo', name: 'Imran Shaikh', role: 'ward_admin', memberships: [{ ward: 'K/E', dept: null, role: 'ward_admin' }], blurb: 'Ward admin, K/E' },
  { email: 'admin@civicops.demo', name: 'Priya Deshmukh', role: 'super_admin', blurb: 'Super admin (city)' },
  { email: 'auditor@civicops.demo', name: 'Kavita Joshi', role: 'auditor', blurb: 'Independent reviewer (Audit Cell, outside the ward)' },
  { email: 'admin2@civicops.demo', name: 'Arjun Rao', role: 'super_admin', blurb: 'Second super admin (concurrency tests)' },
];

const H = 3600_000;

export async function ensureDemoUsers(db: Db): Promise<Record<string, Actor>> {
  const out: Record<string, Actor> = {};
  const hash = hashPassword(DEMO_PASSWORD);
  await withSystem(async (q) => {
    for (const u of DEMO_USERS) {
      const r = await q.query<{ id: string }>(
        `insert into users (email, name, role, password_hash, is_demo) values ($1,$2,$3,$4,true)
         on conflict (email) do update set name = excluded.name, role = excluded.role returning id`, [u.email, u.name, u.role, hash]);
      out[u.email] = { id: r.rows[0].id, role: u.role, name: u.name };
      for (const m of u.memberships ?? []) {
        await q.query(`insert into memberships (user_id, ward_code, department_code, role) select $1,$2,$3,$4
          where not exists (select 1 from memberships where user_id = $1 and ward_code = $2 and department_code is not distinct from $3)`, [r.rows[0].id, m.ward, m.dept, m.role]);
      }
    }
  }, db);
  return out;
}

export async function seedDemo(db: Db, opts: { repoCommit?: string; now?: Date } = {}): Promise<{ message: string }> {
  const users = await ensureDemoUsers(db);
  const now0 = opts.now ?? new Date();
  const cases = await openFlagCases(db, now0);
  await seedCaseExamples(db, { office: users['kw.admin@civicops.demo'], auditor: users['auditor@civicops.demo'] }, now0);
  const escalated = await runCaseSweep(db, now0);
  const caseMsg = ` Accountability cases opened: ${cases}; overdue escalations: ${escalated.length}.`;
  const existing = await withSystem((q) => q.query<{ n: number }>(`select count(*)::int as n from tickets where data_origin = 'demo_seed'`), db);
  if (existing.rows[0].n > 0) return { message: `Demo users ready (${Object.keys(users).length}). Demo tickets already seeded (${existing.rows[0].n}); left unchanged.${caseMsg}` };

  const now = opts.now ?? new Date();
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * H);
  const asha = users['asha@civicops.demo'], ravi = users['ravi@civicops.demo'], neha = users['neha@civicops.demo'];
  const rahul = users['kw.officer@civicops.demo'], meera = users['kw.admin@civicops.demo'];
  const imran = users['ke.officer@civicops.demo'], priya = users['admin@civicops.demo'];
  const opt = { dataOrigin: 'demo_seed' as const };
  const photo = async (actor: Actor, id: string, scene: Parameters<typeof illustration>[0], phase: 'report' | 'before' | 'during' | 'after', when: Date, note?: string) =>
    saveEvidence(db, actor, id, { data: await illustration(scene, `demo ${id.slice(0, 8)} ${phase}`), mime: 'image/jpeg' }, { phase, note, origin: 'illustration' }, when);

  // 1. Backup ticket: a Juhu waterlogging report that went all the way to verified closure.
  const t1 = await createTicket(db, asha, {
    category: 'waterlogging', description: 'Juhu Tara Road near the church is flooded knee deep, two-wheelers are stuck and the bus stop is under water.',
    details: { stretch: 'Juhu Tara Road, church to the signal (about 150 m)', depth: 'knee', trend: 'rising', access: 'full' },
    location: { lat: 19.1279, lon: 72.8466, gpsAccuracyM: 12, source: 'gps' }, landmark: 'Opposite St. Joseph church',
  }, at(50), opt);
  await photo(asha, t1.id, 'flood_before', 'report', at(50), 'Water above the kerb');
  await performAction(db, rahul, t1.id, { action: 'acknowledge', note: 'Seen. Dispatching pump crew.' }, at(49.7));
  await performAction(db, rahul, t1.id, { action: 'first_action', note: 'Dewatering pump deployed at the low point; one lane barricaded' }, at(49.2));
  await performAction(db, rahul, t1.id, { action: 'start_work', note: 'Clearing the storm drain inlet near the bus stop' }, at(48.9));
  await performAction(db, rahul, t1.id, { action: 'progress', note: 'Water down to ankle level; drain inlet had plastic choke, removed' }, at(47.5));
  await performAction(db, rahul, t1.id, { action: 'restore', restored: 'access', note: 'Both lanes passable; bus stop clear' }, at(46.8));
  await photo(rahul, t1.id, 'flood_after', 'after', at(46.7), 'Same stretch after clearing');
  await performAction(db, rahul, t1.id, { action: 'submit_review', note: 'Water cleared, inlet desilted' }, at(46.6));
  await performAction(db, priya, t1.id, { action: 'approve', reason: 'Manual review: after photo shows the same stretch (church, signboard) with the road clear; access restored time recorded.', checklist: { same_location: true, issue_resolved: true, notes_match: true } }, at(45));

  // 2. Fallen tree with possible wire contact (critical, supporting handoff to electrical).
  const t2 = await createTicket(db, neha, {
    category: 'fallen_tree', description: 'Big gulmohar branch fell across the lane, it is resting on the overhead cable.',
    details: { tree_state: 'fallen', blocking: ['one_lane', 'entrance'], wires: 'possible' },
    location: { lat: 19.119, lon: 72.8266, gpsAccuracyM: 20, source: 'gps' }, landmark: 'Versova, near the fish market gate', photoUnsafe: true,
  }, at(3), opt);
  await performAction(db, rahul, t2.id, { action: 'first_action', note: 'Area cordoned; tree team and electrical liaison called' }, at(2.5));
  await performAction(db, rahul, t2.id, { action: 'add_supporting', departmentCode: 'ELE', note: 'Handoff to Street Lighting & Electrical to isolate the cable before cutting' }, at(2.4));

  // 3. Missed garbage pickup (medium: regularly missed). The day-2 reminder fires on the sweep.
  const t3 = await createTicket(db, neha, {
    category: 'missed_garbage', description: 'Bin outside Lokhandwala market not collected again, overflowing onto the footpath.',
    details: { pickup_point: 'Bin outside Lokhandwala market, back lane', missed_date: at(60).toISOString().slice(0, 10), recurrence: 'regular', overflowing: 'yes', footpath_blocked: 'yes' },
    location: { lat: 19.1355, lon: 72.8295, gpsAccuracyM: 15, source: 'gps' },
  }, at(60), opt);
  await photo(neha, t3.id, 'garbage_before', 'report', at(60));
  // 3b. A second resident reports the same bin: suggested duplicate, waits for staff confirmation.
  await createTicket(db, asha, {
    category: 'missed_garbage', description: 'Garbage pile near Lokhandwala market lane, nobody came today.',
    details: { pickup_point: 'Lokhandwala market lane', recurrence: 'few', overflowing: 'yes', footpath_blocked: 'no' },
    location: { lat: 19.1357, lon: 72.8297, gpsAccuracyM: 25, source: 'gps' },
  }, at(20), opt);

  // 4. Burst pipe in Andheri East (critical) with no first action: escalates on the sweep.
  await createTicket(db, ravi, {
    category: 'water_supply', description: 'Main pipe burst near Chakala signal, water gushing on the road, our building has no supply.',
    details: { problem: 'burst', severity: 'gushing', affected: 'road', supply_stopped: 'yes' },
    location: { lat: 19.1115, lon: 72.8655, gpsAccuracyM: 18, source: 'gps' }, landmark: 'Chakala signal',
  }, at(6), opt);

  // 5. Pothole on Link Road (K/W) left for 11 days: resolution breach.
  const t5 = await createTicket(db, asha, {
    category: 'road_damage', description: 'Same pothole on Link Road near Juhu has opened again, bikes are swerving into the next lane.',
    details: { defect: 'pothole', size: 'medium', lane: 'one_lane', mobility: 'swerving' },
    location: { lat: 19.1366, lon: 72.8474, gpsAccuracyM: 10, source: 'gps' },
  }, at(270), opt);
  await performAction(db, rahul, t5.id, { action: 'acknowledge' }, at(260));

  // 6. Ambiguous "Andheri" report sent to triage.
  await createTicket(db, ravi, {
    category: 'drain_sewer', description: 'Drain overflowing near the station, smell everywhere.',
    details: { problem: 'overflow', standing_water: 'yes', impact: 'walkway' },
    location: { localityText: 'Andheri', source: 'locality' }, acceptTriage: true,
  }, at(1.5), opt);

  // 7. Illegal dumping awaiting verification with matching before/after illustrations.
  const t7 = await createTicket(db, neha, {
    category: 'illegal_dumping', description: 'Construction debris dumped on the footpath outside the park.',
    details: { waste_type: 'debris', size: 'truck', obstruction: 'footpath' },
    location: { lat: 19.1265, lon: 72.8355, gpsAccuracyM: 14, source: 'gps' },
  }, at(30), opt);
  await photo(neha, t7.id, 'garbage_before', 'report', at(30));
  await performAction(db, rahul, t7.id, { action: 'start_work', note: 'Debris removal truck sent' }, at(26));
  await photo(rahul, t7.id, 'garbage_after', 'after', at(22), 'Footpath cleared');
  await performAction(db, rahul, t7.id, { action: 'submit_review', note: 'Debris removed; CCTV request filed for the dumper' }, at(21.5));

  // 8. Blocked drain awaiting verification with a mismatched "after" photo (should be returned for rework).
  const t8 = await createTicket(db, asha, {
    category: 'drain_sewer', description: 'Open manhole on the walkway outside Juhu market, no cover at all.',
    details: { problem: 'open_manhole', standing_water: 'no', impact: 'walkway' },
    location: { lat: 19.1052, lon: 72.8268, gpsAccuracyM: 12, source: 'gps' },
  }, at(9), opt);
  await performAction(db, rahul, t8.id, { action: 'first_action', note: 'Barricade placed around the opening' }, at(8));
  await performAction(db, rahul, t8.id, { action: 'start_work' }, at(7));
  await photo(rahul, t8.id, 'unrelated', 'after', at(5), 'Cover replaced');
  await performAction(db, rahul, t8.id, { action: 'submit_review', note: 'New cover fitted' }, at(4.8));

  void meera; void imran;
  const sweep = await runSlaSweep(db, now);
  return { message: `Demo users ready (${Object.keys(users).length}). Seeded 9 demo tickets; SLA sweep fired ${sweep.fired.length} thresholds.${caseMsg}` };
}
