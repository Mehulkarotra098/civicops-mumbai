// WardProof: spending flags, accountability cases, deadlines and independent review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withSystem, withUser } from '../../src/lib/db.ts';
import { loadHistory } from '../../src/lib/history.ts';
import { askQuestion, respond, decide, completeCorrection, runCaseSweep, setResponseWindow } from '../../src/lib/cases.ts';
import { testDb, actor, row, rows, H } from './helpers.ts';

const T0 = new Date('2026-11-21T07:00:00Z');

test('Link Road WO25-01590: bill 23,311 vs 12,220 estimate = 11,091 (90.8%) above; case opened with the amount under review', async () => {
  const db = await testDb();
  const h = await withSystem((q) => loadHistory(q), db);
  const f = h.flags.find((x) => x.work_order_id === 'WO25-01590' && x.type === 'over_rate')!;
  assert.equal(f.evidence.cost, 23311);
  assert.equal(Math.round(f.evidence.expected as number), 12220);
  assert.equal(Math.round(f.evidence.difference as number), 11091);
  assert.equal((f.evidence.pct_above as number).toFixed(1), '90.8');
  assert.match(f.reason, /No approved cost revision is on record/);
  const c = await row<{ amount_under_review: number; responsible_office: string; calculation: { billed: number; reference: number; difference: number; pct_above: number } }>(db, `select * from accountability_cases where work_order_id = 'WO25-01590' and flag_type = 'over_rate'`);
  assert.equal(c.responsible_office, 'Ward K/W Office · Roads');
  assert.equal(c.amount_under_review, 23311 - Math.round(12220 * 1.3));
  assert.deepEqual([c.calculation.billed, c.calculation.reference, c.calculation.difference, c.calculation.pct_above], [23311, 12220, 11091, 90.8]);
});

test('Every money flag has exactly one case; each work order counts once; over-budget flags only where bills exceed the budget', async () => {
  const db = await testDb();
  const h = await withSystem((q) => loadHistory(q), db);
  const money = h.flags.filter((f) => ['over_rate', 'double_billing', 'dlp_paid', 'over_budget'].includes(f.type));
  const cases = await rows<{ k: string }>(db, `select work_order_id || '|' || flag_type as k from accountability_cases where kind = 'flag'`);
  assert.equal(cases.length, money.length);
  assert.equal(new Set(cases.map((c) => c.k)).size, cases.length, 'no duplicate cases');
  const linked = await rows<{ work_order_id: string }>(db, 'select work_order_id from hist_work_order_complaints');
  assert.ok(linked.length > h.wos.length, 'several complaints link to the same job');
  assert.equal(new Set(h.wos.map((w) => w.work_order_id)).size, h.wos.length);
  const overWards = new Set(h.flags.filter((f) => f.type === 'over_budget').map((f) => f.ward_code));
  assert.deepEqual([...overWards].sort(), ['E', 'L', 'M/W', 'R/C']);
});

test('Resident question: redacted in public, original kept private, office misses the deadline, one escalation', async () => {
  const db = await testDb();
  const admin = await actor(db, 'admin@civicops.demo');
  await setResponseWindow(db, admin, 60, T0);
  const r = await askQuestion(db, { workOrderId: 'WO25-01590', type: 'cost_increase', text: 'Why was this billed almost double? Call me on 9876543210 or mail me at test@example.com', name: 'Rina', contact: '9876543210' }, T0);
  const c = await row<{ public_question: string; status: string; response_due_at: Date }>(db, 'select * from accountability_cases where id = $1', [r.id]);
  assert.doesNotMatch(c.public_question, /9876543210|test@example\.com/);
  assert.match(c.public_question, /\[phone removed\]/);
  const p = await row<{ original_question: string; asker_name: string }>(db, 'select * from case_private where case_id = $1', [r.id]);
  assert.match(p.original_question, /9876543210/);
  assert.equal(p.asker_name, 'Rina');
  const resident = await actor(db, 'asha@civicops.demo');
  await assert.rejects(withUser(resident, (q) => q.query('select * from case_private'), db), /permission denied/);
  assert.equal(c.response_due_at.getTime() - T0.getTime(), 60 * 60_000);
  const s1 = await runCaseSweep(db, new Date(T0.getTime() + 61 * 60_000));
  const s2 = await runCaseSweep(db, new Date(T0.getTime() + 62 * 60_000));
  assert.ok(s1.includes(r.ref));
  assert.ok(!s2.includes(r.ref), 'retry does not escalate again');
  const esc = await rows(db, `select * from case_events where case_id = $1 and type = 'escalated_overdue'`, [r.id]);
  assert.equal(esc.length, 1);
  const notes = await rows(db, `select n.* from notifications n join users u on u.id = n.user_id where n.kind = 'case_overdue' and n.dedupe_key like $1 and u.role in ('auditor','super_admin')`, [`case:${r.id}:overdue:%`]);
  assert.equal(notes.length, 3, 'two super admins and the auditor, once each');
  await setResponseWindow(db, admin, 10080, T0);
});

test('Written response leads to independent review; correction required, then corrected; prior values kept', async () => {
  const db = await testDb();
  const office = await actor(db, 'kw.admin@civicops.demo');
  const otherWard = await actor(db, 'ke.officer@civicops.demo');
  const auditor = await actor(db, 'auditor@civicops.demo');
  const r = await askQuestion(db, { workOrderId: 'WO25-01590', type: 'reopened', text: 'Why did the patch on Link Road reopen within a month?' }, T0);
  await assert.rejects(respond(db, otherWard, r.id, { body: 'Not our ward but replying anyway to test permissions.' }, T0), /Only Ward K\/W staff/);
  await assert.rejects(decide(db, auditor, r.id, { decision: 'justified', reason: 'Too early to decide this one' }, T0), /Wait for the written response/);
  await respond(db, office, r.id, { body: 'Hot mix was laid in rain; the contractor will redo it under warranty at no cost.', evidence: [{ kind: 'Inspection record', reference: 'INS/KW/0815' }] }, new Date(T0.getTime() + H));
  let c = await row<{ status: string; decision: string | null }>(db, 'select * from accountability_cases where id = $1', [r.id]);
  assert.equal(c.status, 'awaiting_review');
  assert.equal(c.decision, null, 'a department reply never closes the case');
  await assert.rejects(decide(db, office, r.id, { decision: 'justified', reason: 'We think we are fine' }, T0), /independent reviewer/);
  await assert.rejects(withUser(office, (q) => q.query(`update accountability_cases set decision = 'justified' where id = $1`, [r.id]), db), /Only an independent reviewer/);
  await decide(db, auditor, r.id, { decision: 'correction_required', reason: 'Bill above the normal band with no approved revision; pay up to 1.3x the estimate.', correctedAmount: 15886 }, new Date(T0.getTime() + 2 * H));
  const cc = await row<{ status: string; previous_values: { billed: number }; corrected_values: { billed: number; recovery: number }; corrective_due_at: Date; corrective_owner: string }>(db, 'select * from accountability_cases where id = $1', [r.id]);
  assert.equal(cc.status, 'correction_required');
  assert.equal(cc.previous_values.billed, 23311);
  assert.deepEqual(cc.corrected_values, { billed: 15886, recovery: 7425 });
  assert.ok(cc.corrective_due_at && cc.corrective_owner);
  await completeCorrection(db, office, r.id, 'Corrected bill issued', new Date(T0.getTime() + 3 * H));
  c = await row(db, 'select * from accountability_cases where id = $1', [r.id]);
  assert.equal(c.status, 'correction_required', 'office report alone does not close it');
  await completeCorrection(db, auditor, r.id, 'Verified', new Date(T0.getTime() + 4 * H));
  c = await row(db, 'select * from accountability_cases where id = $1', [r.id]);
  assert.equal(c.status, 'corrected');
  const types = (await rows<{ type: string }>(db, 'select type from case_events where case_id = $1 order by at, id', [r.id])).map((e) => e.type);
  assert.deepEqual(types, ['question_asked', 'assigned', 'response_submitted', 'decision_correction_required', 'correction_reported', 'closed_corrected']);
  await assert.rejects(withUser(auditor, (q) => q.query('delete from case_events where case_id = $1', [r.id]), db), /permission denied|append-only/);
});

test('Walkthrough examples are seeded and labelled as demo examples', async () => {
  const db = await testDb();
  const ex = await rows<{ status: string; flag_type: string }>(db, `select status, flag_type from accountability_cases where is_demo_example order by flag_type`);
  assert.deepEqual(ex.map((e) => `${e.flag_type}:${e.status}`).sort(), ['double_billing:justified', 'over_budget:awaiting_response', 'over_rate:corrected']);
  const resp = await rows<{ body: string }>(db, `select r.body from case_responses r join accountability_cases c on c.id = r.case_id where c.is_demo_example`);
  assert.ok(resp.length >= 3 && resp.every((x) => /Demo example/.test(x.body)));
});
