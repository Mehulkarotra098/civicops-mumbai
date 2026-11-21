import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { withSystem } from '../../src/lib/db.ts';
import { loadHistory, moneyTrail, nextRupee, scorecards, OVER_RATE_THRESHOLD } from '../../src/lib/history.ts';
import { parseCsv } from '../../src/lib/csv.ts';
import { testDb, rows, row } from './helpers.ts';

const REPO = path.resolve(process.env.DATA_REPO || '../Claude-Impact-Labs-data-2');
const csv = (f: string) => parseCsv(fs.readFileSync(path.join(REPO, 'data', f), 'utf8')).rows;

test('All 17 source files imported with source row counts', async () => {
  const db = await testDb();
  const run = await row<{ row_counts: Record<string, { source_rows: number; imported: number }>; source_commit: string }>(db, `select row_counts, source_commit from import_runs where status = 'completed' order by id desc limit 1`);
  assert.equal(Object.keys(run.row_counts).length, 17);
  assert.match(run.source_commit, /^[0-9a-f]{40}$/);
  const counts = await row<Record<string, number>>(db, `select (select count(*)::int from wards) wards, (select count(*)::int from hist_complaints) complaints, (select count(*)::int from hist_work_orders) wos,
    (select count(*)::int from roads) roads, (select count(*)::int from social_posts) posts, (select count(*)::int from hist_work_order_complaints) links, (select count(*)::int from hist_complaints where in_sample_200) sample`);
  assert.deepEqual(counts, { wards: 24, complaints: 6501, wos: 2499, roads: 291, posts: 650, links: 4948, sample: 200 });
});

test('Link Road, Juhu: WO25-01590 matches the repo (₹23,311 bill, ₹12,220 reference, SLA missed, reopened)', async () => {
  const db = await testDb();
  const src = csv('work_orders.csv').find((r) => r.work_order_id === 'WO25-01590')!;
  const rate = csv('rate_card.csv').find((r) => r.repair_method === src.repair_method)!;
  const road = csv('roads.csv').find((r) => r.road_id === src.road_id)!;
  assert.equal(road.road_name, 'Link Road');
  assert.equal(src.cost_inr, '23311');
  assert.equal(Number(src.area_sqm) * Number(rate.standard_rate_inr), 12220);
  const h = await withSystem((q) => loadHistory(q), db);
  const wo = h.wos.find((w) => w.work_order_id === 'WO25-01590')!;
  assert.equal(wo.cost_inr, 23311);
  assert.equal(Math.round(wo.expected_cost), 12220);
  assert.equal(wo.cost_ratio.toFixed(2), '1.91');
  assert.equal(wo.sla_met, false);
  assert.equal(wo.reopened_within_30d, true);
  assert.deepEqual(wo.complaints, ['BMC25-004138']);
  assert.ok(h.flags.some((f) => f.work_order_id === 'WO25-01590' && f.type === 'over_rate'));
});

test('Per-job methods use the flat rate; per-m² methods use area × rate', async () => {
  const db = await testDb();
  const h = await withSystem((q) => loadHistory(q), db);
  const perJob = h.wos.find((w) => w.unit === 'per job')!;
  assert.equal(perJob.expected_cost, perJob.rate);
  const perSqm = h.wos.find((w) => w.unit === 'per sqm')!;
  assert.equal(perSqm.expected_cost, perSqm.area_sqm * perSqm.rate);
});

test('Audit flags catch outliers, not normal variation', async () => {
  const db = await testDb();
  const h = await withSystem((q) => loadHistory(q), db);
  const over = h.flags.filter((f) => f.type === 'over_rate');
  assert.ok(over.every((f) => (f.evidence.ratio as number) > OVER_RATE_THRESHOLD));
  assert.ok(h.wos.filter((w) => w.cost_ratio <= 1.32).every((w) => !over.find((f) => f.work_order_id === w.work_order_id)), 'normal-band jobs are never flagged');
  assert.equal(over.length, 113);
  const dbl = h.flags.filter((f) => f.type === 'double_billing');
  assert.equal(dbl.length, 45, 'every work order with no linked complaint has a same-road, same-work twin within 10 days');
  const dlp = h.flags.filter((f) => f.type === 'dlp_paid');
  assert.ok(dlp.length > 0 && dlp.every((f) => h.wos.find((w) => w.work_order_id === f.work_order_id)?.road?.under_dlp));
});

test('Dashboard totals reconcile with the source bills', async () => {
  const db = await testDb();
  const h = await withSystem((q) => loadHistory(q), db);
  const trail = moneyTrail(h);
  const sourceTotal = csv('work_orders.csv').reduce((s, r) => s + Number(r.cost_inr), 0);
  const inPeriod = trail.reduce((s, w) => s + w.spend + w.spend_outside_period, 0);
  assert.equal(Math.round(inPeriod), Math.round(sourceTotal));
  const budgets = csv('wards.csv').reduce((s, r) => s + Number(r.monsoon_repair_budget_inr_2025), 0);
  assert.equal(trail.reduce((s, w) => s + w.budget_inr_2025, 0), budgets);
  assert.equal(scorecards(h).reduce((s, c) => s + c.jobs, 0), 2499);
});

test('Next-rupee plan for K/W ranks roads and prefers durable methods', async () => {
  const db = await testDb();
  const plan = await withSystem(async (q) => nextRupee(q, await loadHistory(q), 'K/W'), db);
  assert.ok(plan.plan.length > 0);
  for (let i = 1; i < plan.plan.length; i++) assert.ok(plan.plan[i - 1].score >= plan.plan[i].score);
  const top = plan.plan[0];
  assert.ok(top.recommended && top.recommended.cost_per_lasting_fix >= top.recommended.est_cost);
  assert.ok(plan.plan.filter((p) => p.under_dlp).every((p) => p.allocate === 0), 'DLP roads are claimed from the contractor, not funded');
});

test('Complaint-to-work-order links are complete; inconsistent records are flagged for review', async () => {
  const db = await testDb();
  const missing = await rows(db, `select * from hist_work_order_complaints where link_status <> 'valid'`);
  assert.equal(missing.length, 0);
  const sla = await rows<{ record_id: string }>(db, `select record_id from import_issues where issue_type = 'sla_inconsistent'`);
  assert.equal(sla.length, 1);
  const unlinked = await rows(db, `select * from import_issues where issue_type = 'no_linked_complaint'`);
  assert.equal(unlinked.length, 45);
});
