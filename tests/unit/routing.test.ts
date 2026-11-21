import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withSystem } from '../../src/lib/db.ts';
import { loadRefData, loadRules } from '../../src/lib/tickets.ts';
import { resolveLocation, routeDepartment } from '../../src/lib/routing.ts';
import { suggestPriority } from '../../src/lib/priority.ts';
import { testDb } from './helpers.ts';

const ctx = async () => {
  const db = await testDb();
  return withSystem(async (q) => ({ ref: await loadRefData(q), rules: await loadRules(q) }), db);
};

test('24 ward boundaries are loaded', async () => {
  const { ref } = await ctx();
  assert.equal(ref.wards.length, 24);
  assert.ok(ref.wards.every((w) => w.polygon.length && w.polygon[0].length >= 4));
});

test('Juhu GPS routes to Ward K/W, and the typed locality agrees (high confidence)', async () => {
  const { ref } = await ctx();
  const r = resolveLocation({ lat: 19.127878, lon: 72.846547, gpsAccuracyM: 10, source: 'gps', localityText: 'Juhu' }, ref);
  assert.equal(r.status, 'confident');
  assert.equal(r.wardCode, 'K/W');
  assert.equal(r.confidence, 'high');
});

test('Andheri East (typed, no GPS) routes to Ward K/E', async () => {
  const { ref } = await ctx();
  const r = resolveLocation({ localityText: 'Andheri East', source: 'locality' }, ref);
  assert.equal(r.wardCode, 'K/E');
  const alias = resolveLocation({ localityText: 'Andheri (E)', source: 'locality' }, ref);
  assert.equal(alias.wardCode, 'K/E');
  const marathi = resolveLocation({ localityText: 'अंधेरी पूर्व', source: 'locality' }, ref);
  assert.equal(marathi.wardCode, 'K/E');
});

test('A bare "Andheri" is ambiguous: K/E or K/W, so the resident is asked to confirm', async () => {
  const { ref } = await ctx();
  const r = resolveLocation({ localityText: 'Andheri', source: 'locality' }, ref);
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.wardCode, null);
  assert.deepEqual([...new Set(r.candidates.map((c) => c.ward_code))].sort(), ['K/E', 'K/W']);
});

test('Denied GPS: a confirmed locality from search is enough to route', async () => {
  const { ref } = await ctx();
  const r = resolveLocation({ confirmedLocality: 'Juhu', source: 'locality' }, ref);
  assert.equal(r.status, 'confident');
  assert.equal(r.wardCode, 'K/W');
  assert.ok(r.lat && r.lon, 'uses the locality centroid as the location');
});

test('Address and pin in different wards is a conflict (sent to triage)', async () => {
  const { ref } = await ctx();
  const r = resolveLocation({ lat: 19.1279, lon: 72.8466, source: 'pin', address: 'Andheri East, near Chakala' }, ref);
  assert.equal(r.status, 'conflict');
  assert.equal(r.pointWard, 'K/W');
  assert.equal(r.textWard, 'K/E');
});

test('A pin outside every ward boundary is out of bounds (triage)', async () => {
  const { ref } = await ctx();
  const r = resolveLocation({ lat: 19.6, lon: 73.4, source: 'pin' }, ref);
  assert.equal(r.status, 'out_of_bounds');
  assert.equal(r.wardCode, null);
});

test('Imprecise GPS falls back to the typed locality', async () => {
  const { ref } = await ctx();
  const r = resolveLocation({ lat: 19.1279, lon: 72.8466, gpsAccuracyM: 3000, source: 'gps', localityText: 'Andheri East' }, ref);
  assert.equal(r.wardCode, 'K/E');
  assert.match(r.message, /imprecise/);
});

test('Department routing by category, with supporting teams from the report details', async () => {
  const { rules } = await ctx();
  assert.equal(routeDepartment('water_supply', 'K/W', {}, rules).primary, 'HYD');
  assert.equal(routeDepartment('waterlogging', 'K/W', {}, rules).primary, 'SWD');
  assert.equal(routeDepartment('missed_garbage', 'K/W', {}, rules).primary, 'SWM');
  const tree = routeDepartment('fallen_tree', 'K/W', { wires: 'possible', blocking: ['all_lanes'] }, rules);
  assert.equal(tree.primary, 'GDN');
  assert.deepEqual(tree.supporting.sort(), ['DMC', 'ELE']);
  const unclear = routeDepartment('public_space_other', 'K/W', { subtype: 'other' }, rules);
  assert.equal(unclear.primary, null);
  assert.equal(unclear.teamUnclear, true);
});

test('Priority follows impact and exposure', () => {
  assert.equal(suggestPriority('water_supply', { problem: 'burst', severity: 'gushing', affected: 'road', supply_stopped: 'yes' }).priority, 'critical');
  assert.equal(suggestPriority('fallen_tree', { tree_state: 'fallen', blocking: ['emergency'], wires: 'no' }).priority, 'critical');
  assert.equal(suggestPriority('waterlogging', { access: 'full', depth: 'knee' }, { roadType: 'Arterial' }).priority, 'critical');
  assert.equal(suggestPriority('missed_garbage', { recurrence: 'first', footpath_blocked: 'no' }).priority, 'standard');
  assert.equal(suggestPriority('missed_garbage', { recurrence: 'regular' }).priority, 'medium');
  assert.equal(suggestPriority('drain_sewer', { problem: 'open_manhole', impact: 'walkway' }).priority, 'critical');
});
