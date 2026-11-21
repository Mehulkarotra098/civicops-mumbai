import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dlpYears, warrantyFor, breakdown, DLP_YEARS } from '../../src/lib/roads.ts';

const NOW = new Date('2026-11-21T06:30:00Z'); // 21 Nov 2026, 12:00 IST
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const road = (surface: string, last: string | null, under_dlp: boolean) => ({ surface, last_resurfaced: last ? d(last) : null, under_dlp });

test('DLP years by surface: concrete 10, mastic 5, asphalt 3, others unknown', () => {
  assert.equal(dlpYears('Concrete (CC)'), 10);
  assert.equal(dlpYears('Cement concrete'), 10);
  assert.equal(dlpYears('Mastic asphalt'), 5);
  assert.equal(dlpYears('Asphalt'), 3);
  assert.equal(dlpYears('Bituminous'), 3);
  assert.equal(dlpYears('Paver blocks'), null);
  assert.equal(dlpYears(''), null);
  assert.deepEqual(DLP_YEARS, { concrete: 10, mastic: 5, asphalt: 3 });
});

test('Concrete resurfaced May 2024 runs 10 years to 4 May 2034 and agrees with the dataset flag', () => {
  const w = warrantyFor(road('Concrete (CC)', '2024-05-04', true), NOW);
  assert.equal(w.years, 10);
  assert.equal(w.state, 'active');
  assert.equal(w.basis, 'Dataset flag');
  assert.equal(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(w.expires!), '2034-05-04');
  assert.ok(w.daysLeft! > 2700 && w.daysLeft! < 2730);
  assert.deepEqual(w.left, { years: 7, months: 5, days: 13 });
  assert.ok(w.pctUsed! > 25 && w.pctUsed! < 27);
});

test('Asphalt is 3 years; mastic is 5 years', () => {
  const a = warrantyFor(road('Asphalt', '2024-05-04', true), NOW);
  assert.equal(a.years, 3);
  assert.equal(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(a.expires!), '2027-05-04');
  const m = warrantyFor(road('Mastic asphalt', '2023-01-01', false), NOW);
  assert.equal(m.years, 5);
  assert.equal(m.state, 'active');
});

test('Expiring within 90 days vs expired vs unknown', () => {
  const expiring = warrantyFor(road('Asphalt', '2024-02-01', true), NOW);
  assert.equal(expiring.state, 'expiring');
  assert.ok(expiring.daysLeft! > 0 && expiring.daysLeft! <= 90);

  const justOutside = warrantyFor(road('Asphalt', '2024-03-01', true), NOW);
  assert.equal(justOutside.state, 'active');

  const expired = warrantyFor(road('Asphalt', '2019-01-11', false), NOW);
  assert.equal(expired.state, 'expired');
  assert.ok(expired.daysLeft! < 0);
  assert.equal(expired.left, null);
  assert.equal(expired.pctUsed, 100);
  assert.equal(expired.basis, 'Dataset flag'); // the dataset says "not under DLP" and the rule agrees

  const unknown = warrantyFor(road('Paver blocks', '2024-01-01', true), NOW);
  assert.equal(unknown.state, 'unknown');
  assert.equal(unknown.basis, 'Unknown');
  assert.equal(unknown.expires, null);
  assert.match(unknown.note!, /dataset lists this road under defect liability/);

  const noDate = warrantyFor(road('Asphalt', null, false), NOW);
  assert.equal(noDate.state, 'unknown');
});

test('When the dataset flag disagrees with the surface rule, the date is labelled as assumed', () => {
  // Concrete resurfaced 2018: the 10-year rule says covered until 2028, but the dataset says not under DLP.
  const w = warrantyFor(road('Concrete (CC)', '2018-06-01', false), NOW);
  assert.equal(w.state, 'active');
  assert.equal(w.basis, 'Assumed from surface type');
  assert.match(w.note!, /does not list this road/);
});

test('breakdown counts calendar years, months and days', () => {
  assert.deepEqual(breakdown(d('2026-01-15'), d('2026-03-01')), { years: 0, months: 1, days: 14 });
  assert.deepEqual(breakdown(d('2026-11-21'), d('2027-11-21')), { years: 1, months: 0, days: 0 });
});

const hasTestDb = !!process.env.PGLITE_DIR?.includes('test-db');
test('roadProfile returns the work orders, flags and warranty for a known road', { skip: !hasTestDb && 'needs `npm test` (isolated test database)' }, async () => {
  const { testDb } = await import('./helpers.ts');
  const { withSystem } = await import('../../src/lib/db.ts');
  const { roadProfile, roadDirectory } = await import('../../src/lib/roads.ts');
  const db = await testDb();
  // Link Road, Juhu carries WO25-01590 (see history.test.ts).
  const id = (await withSystem((q) => q.query<{ road_id: string }>(`select road_id from hist_work_orders where work_order_id = 'WO25-01590'`), db)).rows[0].road_id;
  const p = await withSystem((q) => roadProfile(q, id, NOW), db);
  assert.ok(p);
  assert.equal(p.road.road_id, id);
  assert.ok(p.workOrders.some((w) => w.work_order_id === 'WO25-01590'));
  for (let i = 1; i < p.workOrders.length; i++) assert.ok(p.workOrders[i - 1].assigned_at >= p.workOrders[i].assigned_at, 'newest first');
  assert.equal(Math.round(p.totalBilled), Math.round(p.workOrders.reduce((s, w) => s + w.cost_inr, 0)));
  assert.ok(p.contractor);
  assert.ok(Number.isFinite(p.midpoint.lat) && Number.isFinite(p.midpoint.lon));
  assert.equal(p.paidTwice.length, p.flags.filter((f) => f.type === 'dlp_paid').length);
  assert.equal(await withSystem((q) => roadProfile(q, 'RD-NOPE', NOW), db), null);

  const dir = await withSystem((q) => roadDirectory(q, NOW), db);
  assert.equal(dir.cards.length, 291);
  assert.ok(dir.stats.paidTwiceFlags > 0);
});
