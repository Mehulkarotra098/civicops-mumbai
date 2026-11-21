// End-to-end service workflows against the real database (PGlite), with a controlled clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withUser } from '../../src/lib/db.ts';
import { createTicket, performAction, runSlaSweep, getTicketRow, followTicket } from '../../src/lib/tickets.ts';
import { assessEvidence } from '../../src/lib/vision.ts';
import { readEvidence } from '../../src/lib/evidence.ts';
import { testDb, actor, at, photo, row, rows, JUHU, ANDHERI_EAST } from './helpers.ts';

const T0 = new Date('2026-11-21T05:12:00Z'); // 10:42 AM IST
const users = async () => {
  const db = await testDb();
  return {
    db,
    asha: await actor(db, 'asha@civicops.demo'), ravi: await actor(db, 'ravi@civicops.demo'), neha: await actor(db, 'neha@civicops.demo'),
    rahul: await actor(db, 'kw.officer@civicops.demo'), sunita: await actor(db, 'kw.swm@civicops.demo'), meera: await actor(db, 'kw.admin@civicops.demo'),
    imran: await actor(db, 'ke.officer@civicops.demo'), priya: await actor(db, 'admin@civicops.demo'), arjun: await actor(db, 'admin2@civicops.demo'),
  };
};

test('Burst pipe in Juhu: K/W water team, red clock, first action, evidence, approval → green 100%', async () => {
  const { db, asha, rahul, priya } = await users();
  const t = await createTicket(db, asha, { category: 'water_supply', description: 'Pipe burst on Juhu Tara Road, water gushing across the road', details: { problem: 'burst', severity: 'gushing', affected: 'road', supply_stopped: 'yes' }, location: JUHU }, T0);
  let r = await row<Record<string, unknown>>(db, 'select * from tickets where id = $1', [t.id]);
  assert.equal(r.ward_code, 'K/W'); assert.equal(r.department_code, 'HYD'); assert.equal(r.priority, 'critical'); assert.equal(r.status, 'assigned'); assert.equal(r.progress_pct, 25);
  assert.equal((r.first_action_due_at as Date).getTime() - T0.getTime(), 5 * 3600_000);
  const alerts = await rows(db, `select * from notifications where ticket_id = $1 and kind = 'critical_alert'`, [t.id]);
  assert.ok(alerts.length >= 1, 'the responsible team is alerted immediately');
  await photo(db, asha, t.id, 'pipe_before', 'report', at(T0, 0.05));
  await performAction(db, rahul, t.id, { action: 'first_action', note: 'Valve closed upstream, area barricaded' }, at(T0, 1.5));
  r = await row(db, 'select * from tickets where id = $1', [t.id]);
  assert.equal(r.first_action_outcome, 'met'); assert.equal(r.status, 'acknowledged'); assert.equal(r.progress_pct, 40);
  await performAction(db, rahul, t.id, { action: 'start_work' }, at(T0, 2));
  assert.equal((await row(db, 'select progress_pct from tickets where id = $1', [t.id])).progress_pct, 60);
  await photo(db, rahul, t.id, 'pipe_after', 'after', at(T0, 6));
  await assert.rejects(performAction(db, rahul, t.id, { action: 'submit_review', note: 'Pipe joint replaced' }, at(T0, 6.1)), /supply was restored/, 'supply restoration must be recorded separately');
  await performAction(db, rahul, t.id, { action: 'restore', restored: 'supply', note: 'Supply restored to the lane' }, at(T0, 6.2));
  await performAction(db, rahul, t.id, { action: 'submit_review', note: 'Pipe joint replaced' }, at(T0, 6.3));
  assert.equal((await row(db, 'select progress_pct from tickets where id = $1', [t.id])).progress_pct, 85);
  await performAction(db, priya, t.id, { action: 'approve', reason: 'After photo shows the same spot dry; supply restored recorded' }, at(T0, 7));
  r = await row(db, 'select * from tickets where id = $1', [t.id]);
  assert.equal(r.status, 'verified_resolved'); assert.equal(r.progress_pct, 100); assert.equal(r.sla_outcome, 'met');
  assert.equal(r.original_priority, 'critical'); assert.ok(r.sla_stopped_at);
  const types = (await rows<{ type: string }>(db, 'select type from ticket_events where ticket_id = $1 order by at, id', [t.id])).map((e) => e.type);
  for (const k of ['submitted', 'routed', 'sla_critical_alert', 'evidence_added', 'first_action', 'work_started', 'supply_restored', 'submitted_for_review', 'verified']) assert.ok(types.includes(k), `history has ${k}`);
  // After approval the sweep never fires again for this ticket.
  const sweep = await runSlaSweep(db, at(T0, 400));
  assert.ok(!sweep.fired.some((f) => f.ref === (r.ref as string)));
});

test('Waterlogging: multiple updates, access restored before review, reviewer sees the trail', async () => {
  const { db, asha, rahul, priya } = await users();
  const t = await createTicket(db, asha, { category: 'waterlogging', description: 'Road flooded near the church, cars stuck', details: { depth: 'knee', trend: 'rising', access: 'full', stretch: 'church to signal' }, location: JUHU }, T0);
  await photo(db, asha, t.id, 'flood_before', 'report', T0);
  await performAction(db, rahul, t.id, { action: 'first_action', note: 'Pump deployed' }, at(T0, 1));
  await performAction(db, rahul, t.id, { action: 'start_work' }, at(T0, 1.2));
  await performAction(db, rahul, t.id, { action: 'progress', note: 'Water now ankle deep' }, at(T0, 2));
  await performAction(db, rahul, t.id, { action: 'progress', note: 'Inlet desilted' }, at(T0, 3));
  await photo(db, rahul, t.id, 'flood_after', 'after', at(T0, 3.5));
  await assert.rejects(performAction(db, rahul, t.id, { action: 'submit_review', note: 'done' }, at(T0, 3.6)), /access was restored/);
  await performAction(db, rahul, t.id, { action: 'restore', restored: 'access', note: 'Both lanes open' }, at(T0, 3.7));
  await performAction(db, rahul, t.id, { action: 'submit_review', note: 'Cleared' }, at(T0, 3.8));
  const a = await assessEvidence(db, priya, t.id);
  assert.equal(a.status, 'completed'); assert.equal(a.provider, 'stub'); assert.equal(a.result?.verdict, 'repaired');
  const ups = await rows(db, `select * from ticket_events where ticket_id = $1 and type = 'progress_update'`, [t.id]);
  assert.equal(ups.length, 2);
  const tr = await row<{ access_restored_at: Date }>(db, 'select access_restored_at from tickets where id = $1', [t.id]);
  assert.equal(tr.access_restored_at.getTime(), at(T0, 3.7).getTime());
});

test('Fallen tree with possible wire contact: tree team primary, electrical supporting, handoff recorded, evidence required', async () => {
  const { db, neha, rahul, priya } = await users();
  const t = await createTicket(db, neha, { category: 'fallen_tree', description: 'Tree across the lane touching cables', details: { tree_state: 'fallen', blocking: ['all_lanes'], wires: 'possible' }, location: { lat: 19.119, lon: 72.8266, source: 'gps', gpsAccuracyM: 15 }, photoUnsafe: true }, T0);
  const r = await row<{ department_code: string; supporting_departments: string[]; priority: string; photo_unsafe: boolean }>(db, 'select * from tickets where id = $1', [t.id]);
  assert.equal(r.department_code, 'GDN'); assert.deepEqual(r.supporting_departments.sort(), ['DMC', 'ELE']); assert.equal(r.priority, 'critical'); assert.equal(r.photo_unsafe, true);
  await performAction(db, rahul, t.id, { action: 'add_supporting', departmentCode: 'ELE', note: 'Electrical to isolate the cable before cutting' }, at(T0, 0.5));
  await performAction(db, rahul, t.id, { action: 'start_work' }, at(T0, 1));
  await assert.rejects(performAction(db, rahul, t.id, { action: 'submit_review', note: 'cleared' }, at(T0, 2)), /after/i, 'no after photo, no review');
  await photo(db, rahul, t.id, 'tree_after', 'after', at(T0, 2.5));
  await performAction(db, rahul, t.id, { action: 'submit_review', note: 'Tree removed' }, at(T0, 2.6));
  await performAction(db, priya, t.id, { action: 'approve', reason: 'Obstruction cleared; electrical handoff on record' }, at(T0, 3));
  const ev = await rows<{ type: string }>(db, `select type from ticket_events where ticket_id = $1 and type = 'supporting_handoff'`, [t.id]);
  assert.equal(ev.length, 1);
});

test('Missed pickup: solid waste team; duplicate linked only after staff confirmation; identities protected', async () => {
  const { db, asha, neha, sunita, meera, rahul } = await users();
  const loc = { lat: 19.1291, lon: 72.8361, gpsAccuracyM: 10, source: 'gps' as const };
  const a = await createTicket(db, neha, { category: 'missed_garbage', description: 'Bin at gate 2 not collected', details: { recurrence: 'first', overflowing: 'yes', footpath_blocked: 'no' }, location: loc }, T0);
  const ra = await row<{ department_code: string; priority: string }>(db, 'select department_code, priority from tickets where id = $1', [a.id]);
  assert.equal(ra.department_code, 'SWM'); assert.equal(ra.priority, 'standard');
  const b = await createTicket(db, asha, { category: 'missed_garbage', description: 'Garbage not picked up near gate', details: { recurrence: 'first' }, location: { ...loc, lat: 19.1292 } }, at(T0, 1));
  assert.ok(b.preview?.duplicates.some((d) => d.id === a.id), 'a nearby same-category ticket is suggested');
  assert.equal((await row<{ status: string }>(db, 'select status from tickets where id = $1', [b.id])).status, 'assigned', 'suggestion alone does not merge');
  // Asha (resident) cannot read Neha's ticket even though it was suggested to her.
  await assert.rejects(withUser(asha, (q) => getTicketRow(q, a.id), db), /not found/i);
  // The SWM officer sees both; the K/W admin confirms the duplicate.
  const seen = await withUser(sunita, (q) => q.query<{ id: string }>('select id from tickets where id = any($1)', [[a.id, b.id]]), db);
  assert.equal(seen.rows.length, 2);
  await performAction(db, meera, b.id, { action: 'confirm_duplicate', duplicateOf: a.id, reason: 'Same bin at gate 2' }, at(T0, 2));
  assert.equal((await row<{ status: string }>(db, 'select status from tickets where id = $1', [b.id])).status, 'duplicate');
  const f = await rows(db, 'select * from ticket_followers where ticket_id = $1 and user_id = $2', [a.id, asha.id]);
  assert.equal(f.length, 1, 'the duplicate reporter now follows the original');
  // As a follower Asha can see the original's status but not Neha's report photo.
  await photo(db, neha, a.id, 'garbage_before', 'report', at(T0, 0.2));
  const evRes = await withUser(asha, (q) => q.query('select id from evidence where ticket_id = $1', [a.id]), db);
  assert.equal(evRes.rows.length, 0);
  await performAction(db, sunita, a.id, { action: 'start_work' }, at(T0, 3));
  await photo(db, sunita, a.id, 'garbage_after', 'after', at(T0, 4));
  const evAfter = await withUser(asha, (q) => q.query('select id from evidence where ticket_id = $1', [a.id]), db);
  assert.equal(evAfter.rows.length, 1, 'followers see repair evidence only');
  void rahul;
});

test('Cross-ward transfer keeps the ticket ID, evidence and original SLA deadline', async () => {
  const { db, ravi, rahul, imran } = await users();
  const t = await createTicket(db, ravi, { category: 'road_damage', description: 'Pothole near the Andheri subway', details: { defect: 'pothole', size: 'small', lane: 'one_lane', mobility: 'minor' }, location: JUHU }, T0);
  await photo(db, ravi, t.id, 'flood_before', 'report', T0);
  const before = await row<{ ref: string; resolution_due_at: Date; ward_code: string }>(db, 'select * from tickets where id = $1', [t.id]);
  assert.equal(before.ward_code, 'K/W');
  await performAction(db, rahul, t.id, { action: 'transfer', wardCode: 'K/E', departmentCode: 'RDS', reason: 'Spot is on the K/E side of the subway' }, at(T0, 3));
  const after = await row<{ ref: string; resolution_due_at: Date; ward_code: string; department_code: string }>(db, 'select * from tickets where id = $1', [t.id]);
  assert.equal(after.ref, before.ref); assert.equal(after.ward_code, 'K/E');
  assert.equal(after.resolution_due_at.getTime(), before.resolution_due_at.getTime());
  const ev = await row<{ from_owner: { ward_code: string }; to_owner: { ward_code: string }; reason: string; actor_id: string }>(db, `select * from ticket_events where ticket_id = $1 and type = 'transferred'`, [t.id]);
  assert.equal(ev.from_owner.ward_code, 'K/W'); assert.equal(ev.to_owner.ward_code, 'K/E'); assert.equal(ev.actor_id, rahul.id); assert.match(ev.reason, /K\/E side/);
  // New owner sees it with its evidence; the old ward no longer does.
  const ke = await withUser(imran, (q) => q.query('select id from evidence where ticket_id = $1', [t.id]), db);
  assert.equal(ke.rows.length, 1);
  await assert.rejects(withUser(rahul, (q) => getTicketRow(q, t.id), db), /not found/i);
});

test('Scheduler: thresholds fire once per threshold even when retried', async () => {
  const { db, ravi } = await users();
  const t = await createTicket(db, ravi, { category: 'water_supply', description: 'Burst main at Chakala flooding the road', details: { problem: 'burst', severity: 'gushing', affected: 'road', supply_stopped: 'no' }, location: ANDHERI_EAST }, T0);
  const count = async (k: string) => (await rows(db, `select * from notifications where ticket_id = $1 and kind = $2`, [t.id, k])).length;
  const first = await runSlaSweep(db, at(T0, 4.2));
  const retry = await runSlaSweep(db, at(T0, 4.3));
  const ref = (await row<{ ref: string }>(db, 'select ref from tickets where id = $1', [t.id])).ref;
  assert.ok(first.fired.some((f) => f.ref === ref && f.key === 'first_action_due_soon'));
  assert.equal(retry.fired.filter((f) => f.ref === ref).length, 0, 'a retry reports nothing new');
  const soon = await count('first_action_due_soon');
  assert.ok(soon >= 1);
  await runSlaSweep(db, at(T0, 5.01));
  await runSlaSweep(db, at(T0, 5.02));
  await runSlaSweep(db, at(T0, 6));
  assert.equal(await count('first_action_due_soon'), soon, 'no duplicates on retry');
  const breach = await count('first_action_breach');
  assert.ok(breach >= 1);
  const evs = await rows(db, `select * from ticket_events where ticket_id = $1 and type = 'sla_first_action_breach'`, [t.id]);
  assert.equal(evs.length, 1, 'one history entry for the escalation');
  const r = await row<{ escalation_level: number; first_action_outcome: string }>(db, 'select escalation_level, first_action_outcome from tickets where id = $1', [t.id]);
  assert.equal(r.escalation_level, 1); assert.equal(r.first_action_outcome, 'breached');
  await runSlaSweep(db, at(T0, 49));
  assert.equal((await row<{ escalation_level: number }>(db, 'select escalation_level from tickets where id = $1', [t.id])).escalation_level, 2);
  const admins = await rows(db, `select n.* from notifications n join users u on u.id = n.user_id where n.ticket_id = $1 and n.kind = 'resolution_breach' and u.role = 'super_admin'`, [t.id]);
  assert.equal(admins.length, 2, 'both super admins notified exactly once');
});

test('Mismatched evidence: returned for rework, earlier decision kept, then approved; reopen preserves history', async () => {
  const { db, asha, rahul, priya } = await users();
  const t = await createTicket(db, asha, { category: 'drain_sewer', description: 'Open manhole on walkway', details: { problem: 'open_manhole', impact: 'walkway', standing_water: 'no' }, location: JUHU }, T0);
  await photo(db, asha, t.id, 'flood_before', 'report', T0);
  await performAction(db, rahul, t.id, { action: 'start_work' }, at(T0, 1));
  await photo(db, rahul, t.id, 'unrelated', 'after', at(T0, 2));
  await performAction(db, rahul, t.id, { action: 'submit_review', note: 'Cover fitted' }, at(T0, 2.1));
  const a1 = await assessEvidence(db, priya, t.id);
  assert.equal(a1.result?.verdict, 'mismatched');
  await performAction(db, priya, t.id, { action: 'rework', reason: 'After photo shows an indoor room, not the walkway', assessmentId: a1.id }, at(T0, 2.5));
  let r = await row<{ status: string; progress_pct: number }>(db, 'select status, progress_pct from tickets where id = $1', [t.id]);
  assert.equal(r.status, 'in_progress'); assert.equal(r.progress_pct, 60);
  await photo(db, rahul, t.id, 'flood_after', 'after', at(T0, 3));
  await performAction(db, rahul, t.id, { action: 'submit_review', note: 'New cover, photo of the same walkway' }, at(T0, 3.1));
  await performAction(db, priya, t.id, { action: 'approve', reason: 'Manual review: same walkway, cover in place' }, at(T0, 3.5));
  const decisions = await rows<{ decision: string; manual: boolean; model_version: string | null }>(db, 'select * from review_decisions where ticket_id = $1 order by created_at', [t.id]);
  assert.deepEqual(decisions.map((d) => d.decision), ['rework', 'approve']);
  assert.equal(decisions[0].manual, false); assert.match(decisions[0].model_version ?? '', /stub/);
  assert.equal(decisions[1].manual, true);
  const evidence = await rows(db, 'select * from evidence where ticket_id = $1', [t.id]);
  assert.equal(evidence.length, 3, 'earlier evidence is preserved');
  // Reopen within 30 days: back to assigned, new clock, earlier outcome kept in history.
  await performAction(db, asha, t.id, { action: 'reopen', reason: 'Cover is broken again' }, at(T0, 48));
  r = await row(db, 'select status, progress_pct, reopen_count from tickets where id = $1', [t.id]);
  assert.equal(r.status, 'assigned'); assert.equal((r as unknown as { reopen_count: number }).reopen_count, 1);
  const reo = await row<{ data: { previous_sla_outcome: string } }>(db, `select data from ticket_events where ticket_id = $1 and type = 'reopened'`, [t.id]);
  assert.equal(reo.data.previous_sla_outcome, 'met');
});

test('Claude unavailable: assessment recorded as unavailable and manual approval still works', async () => {
  const { db, asha, rahul, priya } = await users();
  const prev = process.env.VISION_PROVIDER;
  delete process.env.VISION_PROVIDER;
  const keyBackup = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  try {
    const t = await createTicket(db, asha, { category: 'illegal_dumping', description: 'Debris dumped on footpath', details: { waste_type: 'debris', size: 'small', obstruction: 'footpath' }, location: JUHU }, T0);
    await photo(db, asha, t.id, 'garbage_before', 'report', T0);
    await performAction(db, rahul, t.id, { action: 'start_work' }, at(T0, 1));
    await photo(db, rahul, t.id, 'garbage_after', 'after', at(T0, 2));
    await performAction(db, rahul, t.id, { action: 'submit_review', note: 'Cleared' }, at(T0, 2.1));
    const a = await assessEvidence(db, priya, t.id);
    assert.equal(a.status, 'unavailable'); assert.match(a.error ?? '', /not configured/);
    await performAction(db, priya, t.id, { action: 'approve', reason: 'Manual review: same footpath, debris gone' }, at(T0, 3));
    assert.equal((await row<{ status: string }>(db, 'select status from tickets where id = $1', [t.id])).status, 'verified_resolved');
  } finally {
    if (prev) process.env.VISION_PROVIDER = prev;
    if (keyBackup) process.env.ANTHROPIC_API_KEY = keyBackup;
  }
});

test('Permissions are enforced in the database, not only in the app', async () => {
  const { db, asha, ravi, rahul, sunita, imran, priya } = await users();
  const t = await createTicket(db, asha, { category: 'water_supply', description: 'Leak near my building in Juhu', details: { problem: 'leak', severity: 'steady', affected: 'building', supply_stopped: 'no' }, location: JUHU }, T0);
  const ev = await photo(db, asha, t.id, 'pipe_before', 'report', T0);
  // Another resident: cannot read the ticket or its photo.
  await assert.rejects(withUser(ravi, (q) => getTicketRow(q, t.id), db), /not found/i);
  await assert.rejects(readEvidence(db, ravi, ev.id, true), /not found/i);
  // Another ward's admin cannot read it; an SWM-only officer cannot read a water ticket in their own ward.
  await assert.rejects(withUser(imran, (q) => getTicketRow(q, t.id), db), /not found/i);
  await assert.rejects(withUser(sunita, (q) => getTicketRow(q, t.id), db), /not found/i);
  // The K/W officer can.
  assert.equal((await withUser(rahul, (q) => getTicketRow(q, t.id), db)).id, t.id);
  // Officers and residents cannot approve closure: the app refuses, and so does the database trigger.
  await performAction(db, rahul, t.id, { action: 'start_work' }, at(T0, 1));
  await photo(db, rahul, t.id, 'pipe_after', 'after', at(T0, 2));
  await performAction(db, rahul, t.id, { action: 'submit_review', note: 'Fixed' }, at(T0, 2.1));
  await assert.rejects(performAction(db, rahul, t.id, { action: 'approve', reason: 'self-approve' }, at(T0, 3)), /role/);
  await assert.rejects(withUser(rahul, (q) => q.query(`update tickets set status = 'verified_resolved' where id = $1`, [t.id]), db), /Only a super admin/);
  await assert.rejects(withUser(asha, (q) => q.query(`update tickets set priority = 'critical' where id = $1`, [t.id]), db), /Residents cannot/);
  // Residents cannot read password hashes even with raw SQL.
  await assert.rejects(withUser(asha, (q) => q.query('select password_hash from users'), db), /permission denied/);
  // History is append-only for application users.
  await assert.rejects(withUser(priya, (q) => q.query('delete from ticket_events where ticket_id = $1', [t.id]), db), /permission denied|append-only/);
});

test('Two admins acting on the same version: the second gets a conflict, not a silent overwrite', async () => {
  const { db, asha, rahul, priya, arjun } = await users();
  const t = await createTicket(db, asha, { category: 'streetlight', description: 'Whole stretch dark', details: { extent: 'stretch', damage: 'none' }, location: JUHU }, T0);
  await performAction(db, rahul, t.id, { action: 'start_work' }, at(T0, 1));
  await performAction(db, rahul, t.id, { action: 'submit_review', note: 'Lamps replaced; night check done', noPhotoReason: 'Night check confirmed by the officer' }, at(T0, 2));
  const v = (await row<{ version: number }>(db, 'select version from tickets where id = $1', [t.id])).version;
  await performAction(db, priya, t.id, { action: 'approve', reason: 'Night check note accepted', expectedVersion: v }, at(T0, 3));
  await assert.rejects(performAction(db, arjun, t.id, { action: 'rework', reason: 'Need photo', expectedVersion: v }, at(T0, 3)), /updated this ticket|not available/);
});

test('Double submission with the same client request id creates one ticket', async () => {
  const { db, asha } = await users();
  const input = { category: 'public_space_other', description: 'Broken bench in the park', details: { subtype: 'park' }, location: JUHU, clientRequestId: 'req-dup-test-1' };
  const a = await createTicket(db, asha, input, T0);
  const b = await createTicket(db, asha, input, T0);
  assert.equal(a.id, b.id); assert.equal(b.duplicateSubmission, true);
});

test('Ambiguous location needs confirmation unless the resident accepts triage', async () => {
  const { db, ravi, meera } = await users();
  const base = { category: 'drain_sewer', description: 'Drain overflowing near the station', details: { problem: 'overflow', impact: 'walkway', standing_water: 'yes' }, location: { localityText: 'Andheri', source: 'locality' as const } };
  await assert.rejects(createTicket(db, ravi, base, T0), /could be in Ward/);
  const t = await createTicket(db, ravi, { ...base, acceptTriage: true }, T0);
  const r = await row<{ in_triage: boolean; ward_code: string | null; status: string; progress_pct: number }>(db, 'select * from tickets where id = $1', [t.id]);
  assert.equal(r.in_triage, true); assert.equal(r.ward_code, null); assert.equal(r.status, 'submitted'); assert.equal(r.progress_pct, 10);
  // Follow-only path: another resident can follow an open issue instead of filing.
  await followTicket(db, (await users()).neha, t.id, T0);
  void meera;
});

test('Triage: ward admin routes an ambiguous report; info request round-trip; resident cancel', async () => {
  const { db, ravi, meera, rahul, priya } = await users();
  const t = await createTicket(db, ravi, { category: 'drain_sewer', description: 'Drain overflowing near the station', details: { problem: 'overflow', impact: 'walkway', standing_water: 'yes' }, location: { localityText: 'Andheri', source: 'locality' }, acceptTriage: true }, T0);
  // Ward admins only see triage tickets suggested for their ward; the super admin sees all of them.
  const visible = await withUser(priya, (q) => q.query('select id from tickets where id = $1', [t.id]), db);
  assert.equal(visible.rows.length, 1);
  await performAction(db, priya, t.id, { action: 'route', wardCode: 'K/W', departmentCode: 'SEW', reason: 'Caller confirmed Andheri West station side' }, at(T0, 1));
  let r = await row<{ status: string; ward_code: string; in_triage: boolean; progress_pct: number; resolution_due_at: Date }>(db, 'select * from tickets where id = $1', [t.id]);
  assert.equal(r.status, 'assigned'); assert.equal(r.ward_code, 'K/W'); assert.equal(r.in_triage, false); assert.equal(r.progress_pct, 25);
  await performAction(db, rahul, t.id, { action: 'request_info', note: 'Which side of the station: east or west exit?' }, at(T0, 2));
  r = await row(db, 'select * from tickets where id = $1', [t.id]);
  assert.equal(r.status, 'needs_info'); assert.equal(r.progress_pct, 25, 'progress keeps the last milestone while waiting');
  await assert.rejects(performAction(db, (await users()).asha, t.id, { action: 'provide_info', note: 'not mine' }, at(T0, 3)), /not found|Only the person/);
  await performAction(db, ravi, t.id, { action: 'provide_info', note: 'West exit, near the bus depot' }, at(T0, 3));
  assert.equal((await row<{ status: string }>(db, 'select status from tickets where id = $1', [t.id])).status, 'assigned');
  await performAction(db, ravi, t.id, { action: 'cancel', reason: 'Cleared by itself after the rain stopped' }, at(T0, 4));
  r = await row(db, 'select * from tickets where id = $1', [t.id]);
  assert.equal(r.status, 'cancelled');
  void meera;
});

test('Staff revise priority with a recorded reason (deadline recomputed from the original start); referral stops the clock without verifying', async () => {
  const { db, asha, rahul, meera } = await users();
  const t = await createTicket(db, asha, { category: 'missed_garbage', description: 'Bin not collected outside the school gate', details: { recurrence: 'first', footpath_blocked: 'no' }, location: JUHU }, T0);
  const before = await row<{ priority: string; resolution_due_at: Date; original_priority: string }>(db, 'select * from tickets where id = $1', [t.id]);
  assert.equal(before.priority, 'standard');
  await assert.rejects(performAction(db, rahul, t.id, { action: 'priority', priority: 'medium' }, at(T0, 1)), /reason/i);
  await performAction(db, rahul, t.id, { action: 'priority', priority: 'medium', reason: 'Children walk past this bin; health risk' }, at(T0, 1));
  const after = await row<{ priority: string; resolution_due_at: Date; original_priority: string }>(db, 'select * from tickets where id = $1', [t.id]);
  assert.equal(after.priority, 'medium'); assert.equal(after.original_priority, 'standard');
  assert.equal(after.resolution_due_at.getTime() - T0.getTime(), 168 * 3600_000, 'new deadline counts from the original submission');
  const ev = await row<{ reason: string; actor_id: string; data: { from: string; to: string } }>(db, `select * from ticket_events where ticket_id = $1 and type = 'priority_changed'`, [t.id]);
  assert.match(ev.reason, /Children/); assert.equal(ev.actor_id, rahul.id); assert.deepEqual([ev.data.from, ev.data.to], ['standard', 'medium']);
  await performAction(db, meera, t.id, { action: 'refer', reason: 'Private society bin: forwarded to the society manager' }, at(T0, 2));
  const r = await row<{ status: string; sla_stopped_at: Date | null; verified_at: Date | null }>(db, 'select * from tickets where id = $1', [t.id]);
  assert.equal(r.status, 'referred'); assert.ok(r.sla_stopped_at); assert.equal(r.verified_at, null);
});

test('Super admin assigns an officer and a contractor: the officer is alerted, the resident is told', async () => {
  const { db, asha, rahul, priya } = await users();
  const t = await createTicket(db, asha, { category: 'water_supply', description: 'Burst pipe near Juhu Circle, water on the road', details: { problem: 'burst', severity: 'gushing', affected: 'road', supply_stopped: 'yes' }, location: JUHU }, at(T0, 30));
  const ct = await row<{ contractor_id: string; contractor_name: string }>(db, 'select contractor_id, contractor_name from contractors order by contractor_id limit 1');
  await performAction(db, priya, t.id, { action: 'assign', officerId: rahul.id, contractorId: ct.contractor_id }, at(T0, 30.2));
  const r = await row<{ assigned_officer_id: string; contractor_id: string }>(db, 'select assigned_officer_id, contractor_id from tickets where id = $1', [t.id]);
  assert.equal(r.assigned_officer_id, rahul.id); assert.equal(r.contractor_id, ct.contractor_id);
  const alert = await rows<{ title: string }>(db, `select title from notifications where user_id = $1 and ticket_id = $2 and kind = 'assigned_to_you'`, [rahul.id, t.id]);
  assert.equal(alert.length, 1, 'the assigned officer gets one alert');
  assert.match(alert[0].title, new RegExp(`You were assigned ${t.ref}.*${ct.contractor_name.replace(/[()]/g, '.')}.*due`));
  const told = await rows<{ title: string }>(db, `select title from notifications where user_id = $1 and ticket_id = $2 and title like '%An officer%'`, [asha.id, t.id]);
  assert.equal(told.length, 1, 'the resident is told someone is on it');
});
