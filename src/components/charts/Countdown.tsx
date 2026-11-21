'use client';
// Response-deadline countdown with a time-used bar. Text always says left / overdue.
import { useEffect, useState } from 'react';
import { Icon } from '../icons';

function fmt(ms: number) {
  let m = Math.abs(Math.round(ms / 60000));
  const d = Math.floor(m / 1440); m -= d * 1440;
  const h = Math.floor(m / 60); m -= h * 60;
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function Countdown({ startIso, dueIso, dueLabel, stopped, stoppedLabel }: { startIso: string; dueIso: string; dueLabel: string; stopped?: boolean; stoppedLabel?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  const start = new Date(startIso).getTime();
  const due = new Date(dueIso).getTime();
  if (stopped) {
    return (
      <div className="rounded-xl border border-green-200 bg-ok-soft p-3 text-ok">
        <div className="flex items-center gap-1.5 text-sm font-bold"><Icon name="checkCircle" />{stoppedLabel ?? 'Response received'}</div>
        <div className="text-xs tnum">Was due {dueLabel}</div>
      </div>
    );
  }
  const n = now ?? start;
  const left = due - n;
  const used = Math.max(0, Math.min(1, (n - start) / Math.max(1, due - start)));
  const state = left <= 0 ? 'overdue' : used >= 0.8 ? 'soon' : 'ok';
  const cls = state === 'overdue' ? 'border-red-300 bg-crit-soft text-crit' : state === 'soon' ? 'border-med-edge bg-med-soft text-med' : 'border-teal-200 bg-white text-ink';
  const bar = state === 'overdue' ? 'bg-crit' : state === 'soon' ? 'bg-med-edge' : 'bg-action';
  return (
    <div className={`rounded-xl border p-3 ${cls}`} aria-live="polite">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"><Icon name={state === 'overdue' ? 'alert' : 'clock'} />Written response</div>
      <div className="mt-1 text-2xl font-extrabold tnum">{now == null ? '…' : left <= 0 ? `${fmt(left)} overdue` : `${fmt(left)} left`}</div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5" role="img" aria-label={`${Math.round(used * 100)}% of the response time used`}>
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.round(used * 100)}%` }} />
      </div>
      <div className="mt-1 text-xs tnum">Due {dueLabel}</div>
    </div>
  );
}
