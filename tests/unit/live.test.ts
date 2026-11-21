// Live data: anything entered or uploaded is validated, merged and audited automatically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withSystem } from '../../src/lib/db.ts';
import { ingestRecord, ingestUploads } from '../../src/lib/live.ts';
import { loadHistory } from '../../src/lib/history.ts';
import { loadTrail } from '../../src/lib/trail.ts';
import { loadRefData } from '../../src/lib/tickets.ts';
import { testDb, row, rows } from './helpers.ts';

const NOW = new Date('2026-11-21T08:00:00Z');

test('A bill typed in live is flagged against the rate card and a public case opens automatically', async () => {
  const db = await testDb();
  const r = await ingestRecord(db, 'work_orders.csv', {
    work_order_id: 'WO-LIVE-T001', ward_code: 'K/W', road_id: 'RD0158', work_type: 'Pothole', repair_method: 'Hot mix patch', contractor_id: 'CT07',
    contractor_name: 'Arabian Sea Engineering (synthetic)', assigned_at: '2026-11-20 10:00', work_started_at: '2026-11-20 12:00', completed_at: '2026-11-21 09:00',
    area_sqm: '5', cost_inr: '30000', sla_hours: '72', reopened_within_30d: 'N', engineer_remark: 'Patched', linked_complaint_ids: 'BMC25-004138',
  }, NOW);
  assert.ok(r.flags.some((f) => f.type === 'over_rate'), 'billed 30,000 vs 13,000 estimate is flagged');
  assert.ok(r.cases.some((c) => c.flag_type === 'over_rate'));
  const wo = await row<{ data_origin: string; cost_inr: number }>(db, `select * from hist_work_orders where work_order_id = 'WO-LIVE-T001'`);
  assert.equal(wo.data_origin, 'live_entry'); assert.equal(Number(wo.cost_inr), 30000);
  const h = await withSystem((q) => loadHistory(q), db);
  assert.ok(h.wos.some((w) => w.work_order_id === 'WO-LIVE-T001'), 'appears in every derived view at once');
  // A normal bill gets no money flag.
  const ok = await ingestRecord(db, 'work_orders.csv', { work_order_id: 'WO-LIVE-T002', ward_code: 'K/W', road_id: 'RD0158', work_type: 'Pothole', repair_method: 'Hot mix patch', contractor_id: 'CT07', assigned_at: '2026-11-20 10:00', completed_at: '2026-11-21 09:00', area_sqm: '5', cost_inr: '14000', engineer_remark: 'Work done', linked_complaint_ids: 'BMC25-004138' }, NOW);
  assert.ok(!ok.flags.some((f) => ['over_rate', 'double_billing'].includes(f.type)));
});

test('A live complaint with no ward is placed by its locality and categorised from its words', async () => {
  const db = await testDb();
  await ingestRecord(db, 'complaints.csv', { complaint_id: 'CMP-LIVE-T001', received_at: '2026-11-21 10:30', channel: 'MyBMC App', category_reported: 'Other', description: 'Andheri East मध्ये पाणी साचले आहे, गाड्या अडकल्या आहेत', language: 'mr', locality_text: 'Andheri East', ward_code: '', status: 'Open', complainant_id: 'LIVE' }, NOW);
  const t = await withSystem(async (q) => loadTrail(q, await loadRefData(q)), db);
  const c = t.rows.find((x) => x.complaint_id === 'CMP-LIVE-T001')!;
  assert.equal(c.inferred_ward, 'K/E');
  assert.equal(c.text_category, 'Waterlogging');
  assert.equal(c.status_class, 'open_unfixed');
  assert.match(c.issue_id, /^ISSUE-/);
});

test('Uploaded files merge by ID; duplicate-looking bills are caught; malformed files are rejected before writing', async () => {
  const db = await testDb();
  const csv = [
    'work_order_id,linked_complaint_ids,ward_code,road_id,work_type,repair_method,contractor_id,contractor_name,assigned_at,work_started_at,completed_at,area_sqm,cost_inr,sla_hours,sla_met,reopened_within_30d,engineer_remark',
    'WO-UP-0001,BMC25-004138,K/W,RD0156,Waterlogging,Drain desilting,CT05,Deccan Paving Solutions (synthetic),2026-11-10 08:00,2026-11-10 10:00,2026-11-11 08:00,10,95000,48,Y,N,Work done',
    'WO-UP-0002,,K/W,RD0156,Waterlogging,Drain desilting,CT05,Deccan Paving Solutions (synthetic),2026-11-13 08:00,2026-11-13 10:00,2026-11-14 08:00,10,96000,48,Y,N,Work done',
  ].join('\n');
  const r = await ingestUploads(db, [{ name: 'work_orders.csv', text: csv }], NOW);
  assert.equal(r.counts['work_orders.csv'].imported, 2);
  assert.ok(r.newFlags.includes('WO-UP-0002|double_billing'), 'no complaint + same road and work within 10 days');
  const before = await rows(db, `select * from hist_work_orders where data_origin = 'synthetic_repo'`);
  assert.equal(before.length, 2499, 'existing records untouched');
  await assert.rejects(ingestUploads(db, [{ name: 'work_orders.csv', text: 'work_order_id,ward_code\nX,K/W' }], NOW), /missing column/);
  await assert.rejects(ingestUploads(db, [{ name: 'budget.csv', text: 'a,b' }], NOW), /Unknown file name/);
  const cases = await rows(db, `select * from accountability_cases where work_order_id = 'WO-UP-0002' and flag_type = 'double_billing'`);
  assert.equal(cases.length, 1);
});
