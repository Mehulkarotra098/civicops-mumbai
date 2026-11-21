// SLA clock rules. Pure functions with an explicit `now`, so tests can use a controlled clock.
// Default: time runs from submission (or from reopening, for a reopened ticket) and is not
// paused by requests for information. Verified closure stops the clock.
import type { Priority } from './config.ts';

export interface SlaPolicy {
  id: number;
  version: number;
  priority: Priority;
  label: string;
  first_action_hours: number | null;
  reminder_hours: number | null;
  resolution_hours: number;
  due_soon_fraction: number;
  alert_on_submit: boolean;
}

export interface SlaTicket {
  priority: Priority;
  status: string;
  clock_started_at: Date;
  first_action_due_at: Date | null;
  reminder_at: Date | null;
  resolution_due_at: Date;
  first_action_at: Date | null;
  sla_stopped_at: Date | null;
  reopen_count: number;
}

const H = 3600_000;

export function computeDeadlines(policy: SlaPolicy, start: Date) {
  return {
    first_action_due_at: policy.first_action_hours != null ? new Date(start.getTime() + policy.first_action_hours * H) : null,
    reminder_at: policy.reminder_hours != null ? new Date(start.getTime() + policy.reminder_hours * H) : null,
    resolution_due_at: new Date(start.getTime() + policy.resolution_hours * H),
  };
}

export type ClockState = 'on_track' | 'due_soon' | 'overdue' | 'met' | 'breached' | 'stopped';

export interface ClockView {
  kind: 'first_action' | 'resolution';
  dueAt: Date;
  remainingMs: number;
  state: ClockState;
}

/** The clock a person should look at right now: first action for critical tickets until it happens, then resolution. */
export function activeClock(t: SlaTicket, now: Date, dueSoonFraction = 0.8): ClockView {
  const start = t.clock_started_at.getTime();
  if (t.sla_stopped_at) {
    const met = t.sla_stopped_at.getTime() <= t.resolution_due_at.getTime();
    return { kind: 'resolution', dueAt: t.resolution_due_at, remainingMs: t.resolution_due_at.getTime() - t.sla_stopped_at.getTime(), state: met ? 'met' : 'breached' };
  }
  const useFirst = t.first_action_due_at && !t.first_action_at;
  const due = (useFirst ? t.first_action_due_at : t.resolution_due_at) as Date;
  const remaining = due.getTime() - now.getTime();
  const window = due.getTime() - start;
  let state: ClockState = 'on_track';
  if (remaining <= 0) state = 'overdue';
  else if (now.getTime() - start >= window * dueSoonFraction) state = 'due_soon';
  return { kind: useFirst ? 'first_action' : 'resolution', dueAt: due, remainingMs: remaining, state };
}

export type ThresholdKey =
  | 'critical_alert'
  | 'first_action_due_soon'
  | 'first_action_breach'
  | 'reminder_day2'
  | 'resolution_due_soon'
  | 'resolution_breach';

export interface ThresholdHit { key: ThresholdKey; at: Date; cycle: number }

const CLOSED = new Set(['verified_resolved', 'cancelled', 'duplicate', 'referred']);

/** Every threshold that has been reached and still applies. The scheduler de-duplicates by key + cycle. */
export function thresholdsReached(t: SlaTicket, policy: Pick<SlaPolicy, 'due_soon_fraction' | 'alert_on_submit'>, now: Date): ThresholdHit[] {
  if (t.sla_stopped_at || CLOSED.has(t.status)) return [];
  const out: ThresholdHit[] = [];
  const cycle = t.reopen_count;
  const start = t.clock_started_at.getTime();
  const n = now.getTime();
  if (t.priority === 'critical' && policy.alert_on_submit) out.push({ key: 'critical_alert', at: t.clock_started_at, cycle });
  if (t.first_action_due_at && !t.first_action_at) {
    const due = t.first_action_due_at.getTime();
    const soon = start + (due - start) * policy.due_soon_fraction;
    if (n >= soon && n < due) out.push({ key: 'first_action_due_soon', at: new Date(soon), cycle });
    if (n >= due) out.push({ key: 'first_action_breach', at: t.first_action_due_at, cycle });
  }
  if (t.reminder_at && n >= t.reminder_at.getTime() && n < t.resolution_due_at.getTime()) {
    out.push({ key: 'reminder_day2', at: t.reminder_at, cycle });
  }
  const due = t.resolution_due_at.getTime();
  const soon = start + (due - start) * policy.due_soon_fraction;
  if (n >= soon && n < due) out.push({ key: 'resolution_due_soon', at: new Date(soon), cycle });
  if (n >= due) out.push({ key: 'resolution_breach', at: t.resolution_due_at, cycle });
  return out;
}

export function formatDuration(ms: number): string {
  const neg = ms < 0;
  let s = Math.abs(Math.round(ms / 60000));
  const d = Math.floor(s / 1440); s -= d * 1440;
  const h = Math.floor(s / 60); const m = s - h * 60;
  const txt = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return neg ? `${txt} overdue` : `${txt} left`;
}

export const PRIORITY_DISPLAY: Record<Priority, { label: string; color: string; tone: string }> = {
  critical: { label: 'Red · Critical', color: 'red', tone: 'critical' },
  medium: { label: 'Yellow · Medium', color: 'yellow', tone: 'medium' },
  standard: { label: 'Orange · Standard', color: 'orange', tone: 'standard' },
};
