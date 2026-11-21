// Shared presentational components. Colour is never the only signal: every badge has an icon and text.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './icons';
import { MILESTONES, CATEGORY_BY_CODE } from '@/lib/config';
import { formatIST } from '@/lib/time';

export const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted', assigned: 'Assigned', acknowledged: 'Acknowledged', in_progress: 'In progress',
  awaiting_verification: 'Awaiting verification', verified_resolved: 'Verified resolved', needs_info: 'Needs reply',
  referred: 'Referred', duplicate: 'Duplicate', cancelled: 'Cancelled',
};

export function PriorityBadge({ priority, original, resolved }: { priority: string; original?: string; resolved?: boolean }) {
  const p = resolved && original ? original : priority;
  const map: Record<string, { cls: string; icon: string; label: string }> = {
    critical: { cls: 'bg-crit-soft text-crit border-red-200', icon: 'alert', label: 'Red · Critical' },
    medium: { cls: 'bg-med-soft text-med border-med-edge', icon: 'clock', label: 'Yellow · Medium' },
    standard: { cls: 'bg-std-soft text-std border-orange-200', icon: 'circle', label: 'Orange · Standard' },
  };
  const m = map[p] ?? map.standard;
  return <span className={`chip ${m.cls}`}><Icon name={m.icon} className="h-3.5 w-3.5" />{m.label}{resolved ? ' (original)' : ''}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const green = status === 'verified_resolved';
  const grey = ['cancelled', 'duplicate', 'referred'].includes(status);
  const cls = green ? 'bg-ok-soft text-ok border-green-200' : grey ? 'bg-gray-100 text-gray-700 border-gray-300'
    : status === 'needs_info' ? 'bg-blue-50 text-blue-800 border-blue-200' : status === 'awaiting_verification' ? 'bg-violet-50 text-violet-800 border-violet-200' : 'bg-slate-100 text-slate-800 border-slate-300';
  return <span className={`chip ${cls}`}><Icon name={green ? 'checkCircle' : grey ? 'x' : 'circle'} className="h-3.5 w-3.5" />{green ? 'Green · Verified resolved' : STATUS_LABEL[status] ?? status}</span>;
}

export function OriginBadge({ origin }: { origin: string }) {
  if (origin === 'operational') return <span className="chip border-teal-200 bg-teal-50 text-teal-800">Live ticket</span>;
  if (origin === 'demo_seed') return <span className="chip border-slate-300 bg-slate-50 text-slate-700">Demo seed ticket</span>;
  if (origin === 'illustration') return <span className="chip border-amber-300 bg-amber-50 text-amber-900">Illustration photo</span>;
  return <span className="chip border-indigo-200 bg-indigo-50 text-indigo-800">Synthetic historical record</span>;
}

export function SyntheticNote({ children }: { children?: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
      <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children ?? 'Synthetic data from the Claude Impact Lab repo. Not BMC records; contractors are fictional.'}</span>
    </p>
  );
}

export function CategoryIcon({ code, className = 'h-5 w-5' }: { code: string; className?: string }) {
  return <Icon name={CATEGORY_BY_CODE[code]?.icon ?? 'more'} className={className} />;
}

export function MilestoneBar({ status, pct }: { status: string; pct: number }) {
  const closedOther = ['cancelled', 'duplicate', 'referred'].includes(status);
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">Progress</span>
        <span className={`font-bold ${pct === 100 ? 'text-ok' : ''}`}>{pct}%</span>
      </div>
      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progress ${pct}%`}>
        <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-ok' : closedOther ? 'bg-gray-400' : 'bg-action'}`} style={{ width: `${pct}%` }} />
      </div>
      <ol className="mt-3 grid grid-cols-3 gap-x-2 gap-y-2 text-xs sm:grid-cols-6">
        {MILESTONES.map((m) => {
          const done = pct >= m.pct && !closedOther;
          return (
            <li key={m.status} className={`flex items-start gap-1.5 ${done ? 'text-ink' : 'text-gray-500'}`}>
              <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${done ? (m.pct === 100 ? 'border-ok bg-ok text-white' : 'border-action bg-action text-white') : 'border-gray-300 bg-white'}`}>
                {done ? <Icon name="check" className="h-3 w-3" /> : null}
              </span>
              <span><span className="font-semibold">{m.pct}%</span> {m.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Kpi({ label, value, sub, href, tone }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; tone?: 'crit' | 'ok' | 'med' }) {
  const toneCls = tone === 'crit' ? 'text-crit' : tone === 'ok' ? 'text-ok' : tone === 'med' ? 'text-med' : 'text-ink';
  const body = (
    <>
      <div className="kicker">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneCls}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted">{sub}</div> : null}
      {href ? <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-action">View records <Icon name="arrowRight" className="h-3 w-3" /></div> : null}
    </>
  );
  return href ? <Link href={href} className="card block p-4 hover:border-action">{body}</Link> : <div className="card p-4">{body}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <Icon name="checkCircle" className="h-8 w-8 text-gray-400" />
      <p className="font-semibold">{title}</p>
      {children ? <div className="text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function PageHeader({ kicker, title, children, actions }: { kicker?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {kicker ? <div className="kicker">{kicker}</div> : null}
        <h1 className="h1 mt-1">{title}</h1>
        {children ? <div className="mt-2 max-w-3xl text-sm text-muted">{children}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export interface TimelineEvent {
  id: number; at: string | Date; actor_role: string; actor_name: string | null; type: string; from_status: string | null; to_status: string | null;
  from_owner: Record<string, unknown> | null; to_owner: Record<string, unknown> | null; reason: string | null; note: string | null; visibility: string; data: Record<string, unknown>;
}

const EVENT_LABEL: Record<string, string> = {
  submitted: 'Report submitted', routed: 'Routed to ward and department', triaged: 'Sent to triage', officer_assigned: 'Officer assigned',
  acknowledged: 'Acknowledged', first_action: 'First action', work_started: 'Work started', progress_update: 'Progress update',
  access_restored: 'Access restored', supply_restored: 'Supply restored', transferred: 'Transferred', priority_changed: 'Priority changed',
  info_requested: 'Information requested', info_provided: 'Resident replied', submitted_for_review: 'Completion evidence submitted',
  verified: 'Closure verified', returned_for_rework: 'Returned for rework', more_evidence_requested: 'More evidence requested',
  reopened: 'Reopened', cancelled: 'Cancelled', duplicate_suggested: 'Possible duplicate found', duplicate_confirmed: 'Confirmed as duplicate',
  duplicate_linked: 'Duplicate linked', duplicate_rejected: 'Duplicate suggestion rejected', referred: 'Referred to another agency',
  supporting_handoff: 'Supporting team handoff', supporting_added: 'Supporting team added', evidence_added: 'Photo added', follower_added: 'Another resident is following',
  assessment_recorded: 'Claude assessment recorded', sla_critical_alert: 'Critical alert sent', sla_first_action_due_soon: 'First action due soon',
  sla_first_action_breach: 'Escalated: first-action deadline missed', sla_reminder_day2: 'Day-2 reminder', sla_resolution_due_soon: 'Resolution deadline approaching',
  sla_resolution_breach: 'Escalated: resolution deadline missed',
};

export function Timeline({ events, viewerId, viewerRole }: { events: (TimelineEvent & { actor_id?: string | null })[]; viewerId: string; viewerRole: string }) {
  if (!events.length) return <p className="text-sm text-muted">No activity yet.</p>;
  return (
    <ol className="relative space-y-4 border-l-2 border-line pl-5">
      {events.map((e) => {
        const breach = e.type.endsWith('breach') || e.type === 'returned_for_rework';
        const good = e.type === 'verified' || e.type.endsWith('restored');
        const who = e.actor_role === 'system' ? 'CivicOps (automatic)' : e.actor_role === 'resident' ? (e.actor_id === viewerId ? 'You' : viewerRole === 'resident' ? 'Another resident' : `${e.actor_name ?? 'Resident'} (resident)`) : `${e.actor_name} · ${e.actor_role.replace('_', ' ')}`;
        const fo = e.from_owner as { ward_code?: string; department_code?: string } | null;
        const to = e.to_owner as { ward_code?: string; department_code?: string; officer_name?: string } | null;
        return (
          <li key={e.id} className="relative">
            <span className={`absolute -left-[27px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white ${breach ? 'bg-crit' : good ? 'bg-ok' : 'bg-action'}`} aria-hidden />
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className={`text-sm font-semibold ${breach ? 'text-crit' : ''}`}>{EVENT_LABEL[e.type] ?? e.type.replace(/_/g, ' ')}</span>
              {e.from_status && e.to_status ? <span className="text-xs text-muted">{STATUS_LABEL[e.from_status] ?? e.from_status} → {STATUS_LABEL[e.to_status] ?? e.to_status}</span> : null}
              {e.visibility === 'staff' ? <span className="chip border-gray-300 bg-gray-50 text-gray-600">Staff only</span> : null}
            </div>
            <div className="text-xs text-muted"><time dateTime={new Date(e.at).toISOString()}>{formatIST(e.at)}</time> · {who}</div>
            {fo || to ? <div className="mt-1 text-xs">{fo?.ward_code || fo?.department_code ? <>From <b>{fo?.ward_code ?? '—'} / {fo?.department_code ?? '—'}</b> </> : null}{to ? <>to <b>{to.ward_code ?? '—'} / {to.department_code ?? '—'}{to.officer_name ? ` · ${to.officer_name}` : ''}</b></> : null}</div> : null}
            {e.reason ? <p className="mt-1 text-sm"><span className="font-medium">Reason:</span> {e.reason}</p> : null}
            {e.note ? <p className="mt-1 text-sm text-gray-700">{e.note}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
