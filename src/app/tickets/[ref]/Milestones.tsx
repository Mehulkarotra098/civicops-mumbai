// Milestone stepper on the signature trail line. Keeps first action, work completion and
// verified closure as separate steps, and shows rework / reopen loops as marked steps.
import { formatIST } from '@/lib/time';
import { Icon } from '@/components/icons';
import { Meter, TRAIL_STEPS, trailIndex, type TimelineEvent } from '@/components/ui';

interface T {
  status: string; progress_pct: number; in_triage: boolean; submitted_at: Date; routed_at: Date | null; first_action_at: Date | null; first_action_due_at: Date | null;
  work_started_at: Date | null; acknowledged_at: Date | null; completion_submitted_at: Date | null; verified_at: Date | null; resolution_due_at: Date;
}

const HINT = [
  'Report received with a tracking ID',
  'Ward and department confirmed',
  'First response on site (not the fix yet)',
  'Crew working on the repair',
  'Officer uploads after-photos and a repair note',
  'Super admin checks the photos and closes it',
];

const LOOP: Record<string, { label: string; icon: string }> = {
  returned_for_rework: { label: 'Returned for rework', icon: 'history' },
  more_evidence_requested: { label: 'More evidence requested', icon: 'camera' },
  reopened: { label: 'Reopened by resident', icon: 'history' },
};

export function Milestones({ t, events }: { t: T; events: TimelineEvent[] }) {
  const closedOther = ['cancelled', 'duplicate', 'referred'].includes(t.status);
  const idx = closedOther ? -1 : trailIndex(t);
  const green = t.status === 'verified_resolved';
  const routedAt = t.routed_at ?? events.find((e) => e.type === 'routed')?.at ?? null;
  const times: (Date | string | null)[] = [t.submitted_at, routedAt, t.first_action_at ?? t.acknowledged_at, t.work_started_at, t.completion_submitted_at, t.verified_at];
  const due: (string | null)[] = [null, null, t.first_action_due_at ? `Due ${formatIST(t.first_action_due_at)}` : null, null, `Due ${formatIST(t.resolution_due_at)}`, null];
  const loops = events.filter((e) => LOOP[e.type]);
  const pct = t.progress_pct;

  return (
    <section className="card p-5" aria-labelledby="ms-h">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="ms-h" className="h2">Where it is now</h2>
          <p className="text-xs text-muted">Every step is time-stamped in Mumbai time (IST).</p>
        </div>
        <div className="flex items-baseline gap-1.5 text-sm"><span className="font-semibold">Progress</span><span className={`tnum text-2xl font-extrabold tracking-tight ${green ? 'text-ok' : 'text-action'}`}>{pct}%</span></div>
      </div>
      <div className="mt-3"><Meter pct={pct} tone={green ? 'ok' : closedOther ? 'muted' : 'action'} label={`Progress ${pct}%`} className="h-2.5" /></div>
      {closedOther ? <p className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">This ticket was closed without a repair ({t.status}). The history below shows why.</p> : null}

      {/* Phone: vertical trail. Desktop: horizontal trail. Same list, different layout. */}
      <ol className="relative mt-5 space-y-4 pl-10 before:absolute before:bottom-3 before:left-[13px] before:top-3 before:w-0.5 before:bg-action/25 lg:grid lg:grid-cols-6 lg:gap-3 lg:space-y-0 lg:pl-0 lg:before:hidden">
        {TRAIL_STEPS.map((s, i) => {
          const done = i < idx;
          const cur = i === idx;
          const verifiedStep = i === 5;
          const dot = done ? (green || verifiedStep ? 'border-ok bg-ok text-white' : 'border-action bg-action text-white') : cur ? 'border-action bg-white text-action ring-4 ring-action/15' : 'border-gray-300 bg-white text-gray-400';
          const stamp = done ? times[i] : null;
          return (
            <li key={s} className="relative lg:pt-0" aria-current={cur ? 'step' : undefined}>
              <div className="lg:flex lg:items-center">
                <span className={`absolute -left-10 top-0 flex h-7 w-7 items-center justify-center rounded-full border-2 lg:static lg:shrink-0 ${dot}`} aria-hidden>
                  {done ? <Icon name="check" className="h-3.5 w-3.5" /> : <span className="tnum text-[11px] font-bold">{i + 1}</span>}
                </span>
                {i < 5 ? <span className={`hidden h-0.5 flex-1 lg:ml-2 lg:block ${done ? (green ? 'bg-ok' : 'bg-action') : 'bg-gray-200'}`} aria-hidden /> : null}
              </div>
              <div className="lg:mt-2">
                <div className={`text-sm font-semibold ${done ? (verifiedStep ? 'text-ok' : 'text-ink') : cur ? 'text-action' : 'text-gray-500'}`}>
                  {s}{cur ? <span className="ml-1.5 chip border-teal-200 bg-action-soft text-action">{t.status === 'needs_info' ? 'Waiting for reply' : i === 1 && t.in_triage ? 'In triage' : 'Now'}</span> : null}
                  <span className="sr-only">{done ? ' (done)' : cur ? ' (current step)' : ' (not yet)'}</span>
                </div>
                <div className="text-xs text-muted">{HINT[i]}</div>
                {stamp ? <div className="tnum mt-0.5 text-xs font-medium text-ink"><time dateTime={new Date(stamp).toISOString()}>{formatIST(stamp)}</time></div> : null}
                {cur && due[i] ? <div className="tnum mt-0.5 text-xs font-medium text-med">{due[i]}</div> : null}
              </div>
            </li>
          );
        })}
      </ol>

      {loops.length ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-crit-soft/60 p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-crit"><Icon name="history" />Sent back {loops.length === 1 ? 'once' : `${loops.length} times`}</h3>
          <ol className="mt-2 space-y-2">
            {loops.map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-red-300 bg-white text-crit" aria-hidden><Icon name={LOOP[e.type].icon} className="h-3 w-3" /></span>
                <span><b>{LOOP[e.type].label}</b> <span className="tnum text-xs text-muted">· {formatIST(e.at)}</span>{e.reason ? <span className="block text-xs text-gray-700">{e.reason}</span> : null}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
