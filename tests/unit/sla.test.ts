import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeClock, computeDeadlines, thresholdsReached, type SlaPolicy } from '../../src/lib/sla.ts';
import { formatIST } from '../../src/lib/time.ts';

const H = 3600_000;
const start = new Date('2026-11-21T05:12:00Z'); // 21 Nov 2026, 10:42 AM IST
const pol = (p: Partial<SlaPolicy>): SlaPolicy => ({ id: 1, version: 1, priority: 'standard', label: '', first_action_hours: null, reminder_hours: null, resolution_hours: 240, due_soon_fraction: 0.8, alert_on_submit: false, ...p });
const ticket = (policy: SlaPolicy, extra: Record<string, unknown> = {}) => ({
  priority: policy.priority, status: 'assigned', clock_started_at: start, first_action_at: null, sla_stopped_at: null, reopen_count: 0,
  ...computeDeadlines(policy, start), ...extra,
});
const keys = (t: ReturnType<typeof ticket>, p: SlaPolicy, hours: number) => thresholdsReached(t as never, p, new Date(start.getTime() + hours * H)).map((x) => x.key).sort();

test('IST display of UTC timestamps', () => {
  assert.equal(formatIST(start), '21 Nov 2026, 10:42 AM IST');
});

test('Red · Critical: alert at once, first action due at 5 h, due-soon at 4 h, breach after 5 h', () => {
  const p = pol({ priority: 'critical', first_action_hours: 5, resolution_hours: 48, alert_on_submit: true });
  const t = ticket(p);
  assert.equal(t.first_action_due_at!.getTime() - start.getTime(), 5 * H);
  assert.deepEqual(keys(t, p, 0.1), ['critical_alert']);
  assert.deepEqual(keys(t, p, 4.2), ['critical_alert', 'first_action_due_soon']);
  assert.deepEqual(keys(t, p, 4.99), ['critical_alert', 'first_action_due_soon']);
  assert.deepEqual(keys(t, p, 5), ['critical_alert', 'first_action_breach']);
  // A meaningful first action stops the first-action clock; resolution is tracked separately.
  const acted = ticket(p, { first_action_at: new Date(start.getTime() + 3 * H) });
  assert.deepEqual(keys(acted, p, 6), ['critical_alert']);
  assert.equal(activeClock(acted as never, new Date(start.getTime() + 6 * H)).kind, 'resolution');
  assert.equal(activeClock(t as never, new Date(start.getTime() + 6 * H)).state, 'overdue');
});

test('Yellow · Medium: reminder at day 2, resolution due at day 7', () => {
  const p = pol({ priority: 'medium', reminder_hours: 48, resolution_hours: 168 });
  const t = ticket(p);
  assert.deepEqual(keys(t, p, 47.9), []);
  assert.deepEqual(keys(t, p, 48), ['reminder_day2']);
  assert.deepEqual(keys(t, p, 140), ['reminder_day2', 'resolution_due_soon']);
  assert.deepEqual(keys(t, p, 168), ['resolution_breach']);
});

test('Orange · Standard: resolution due at day 10', () => {
  const p = pol({ priority: 'standard', resolution_hours: 240 });
  const t = ticket(p);
  assert.deepEqual(keys(t, p, 191), []);
  assert.deepEqual(keys(t, p, 193), ['resolution_due_soon']);
  assert.deepEqual(keys(t, p, 239.9), ['resolution_due_soon']);
  assert.deepEqual(keys(t, p, 240), ['resolution_breach']);
});

test('Verified approval stops the clock: no thresholds afterwards, outcome is kept', () => {
  const p = pol({ priority: 'medium', reminder_hours: 48, resolution_hours: 168 });
  const stopped = ticket(p, { status: 'verified_resolved', sla_stopped_at: new Date(start.getTime() + 30 * H) });
  assert.deepEqual(keys(stopped, p, 500), []);
  assert.equal(activeClock(stopped as never, new Date(start.getTime() + 500 * H)).state, 'met');
});
