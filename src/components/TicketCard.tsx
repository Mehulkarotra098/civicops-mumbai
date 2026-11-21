import Link from 'next/link';
import type { TicketRow } from '@/lib/tickets';
import { activeClock } from '@/lib/sla';
import { formatIST } from '@/lib/time';
import { CategoryIcon, MiniTrail, PriorityBadge, STAGE_LABEL, StatusBadge } from './ui';
import { DeadlineClock } from './client';
import { Icon } from './icons';

/** The one thing staff should do next on this ticket (null when it is not on them). */
export function staffNextAction(t: Pick<TicketRow, 'status' | 'assigned_officer_id' | 'first_action_at' | 'first_action_due_at' | 'in_triage'>): string | null {
  if (['assigned', 'acknowledged', 'in_progress'].includes(t.status) && !t.assigned_officer_id) return 'Assign an officer';
  switch (t.status) {
    case 'submitted': return t.in_triage ? 'Confirm ward and team' : 'Confirm the report';
    case 'assigned': return t.first_action_due_at && !t.first_action_at ? 'Record first action' : 'Acknowledge or start work';
    case 'acknowledged': return t.first_action_due_at && !t.first_action_at ? 'Record first action' : 'Start work';
    case 'in_progress': return 'Upload after-photo and submit';
    default: return null;
  }
}

export function TicketCard({ t, showOwner = true, showNext = false }: { t: TicketRow & { officer_name?: string | null; contractor_name?: string | null }; showOwner?: boolean; showNext?: boolean }) {
  const c = activeClock(t, new Date());
  const resolved = t.status === 'verified_resolved';
  const next = showNext ? staffNextAction(t) : null;
  return (
    <Link href={`/tickets/${t.ref}`} className={`card block p-3.5 transition-shadow duration-200 hover:border-action hover:shadow-[var(--shadow-2)] motion-reduce:transition-none ${resolved ? 'border-green-200' : c.state === 'overdue' && !resolved && t.status !== 'awaiting_verification' ? 'border-red-200' : ''}`} data-testid={`ticket-card-${t.ref}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="tnum font-mono text-xs font-bold">{t.ref}</span>
        <PriorityBadge priority={t.priority} original={t.original_priority} resolved={resolved} />
        {t.escalation_level > 0 && !resolved ? <span className="chip border-red-300 bg-crit-soft text-crit"><Icon name="alert" className="h-3 w-3" />Escalated</span> : null}
      </div>
      <div className="mt-2 flex items-start gap-2 text-sm font-semibold leading-snug"><CategoryIcon code={t.category_code} className="mt-0.5 h-4 w-4 shrink-0 text-action" /><span className="min-w-0">{t.title}</span></div>
      {showOwner ? <div className="mt-1 text-xs text-muted">{t.ward_code ? `Ward ${t.ward_code}` : 'Triage'}{t.department_code ? ` · ${t.department_code}` : ''} · <b className="text-ink">{t.officer_name ?? (t.assigned_officer_id ? 'Ward officer' : 'nobody yet')}</b>{t.contractor_name ? <> · {t.contractor_name}</> : null}</div> : null}
      <div className="mt-3">
        <MiniTrail t={t} />
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
          <StatusBadge status={t.status} />
          <span className={`tnum font-semibold ${t.progress_pct === 100 ? 'text-ok' : 'text-muted'}`}>{t.progress_pct}% · {STAGE_LABEL[t.status] ?? t.status}</span>
        </div>
      </div>
      <div className="mt-2"><DeadlineClock compact dueAt={c.dueAt.toISOString()} startedAt={t.clock_started_at.toISOString()} kind={c.kind} stoppedAt={t.sla_stopped_at?.toISOString() ?? null} outcome={t.sla_outcome} dueLabel={formatIST(c.dueAt)} /></div>
      {next ? <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-action"><Icon name="arrowRight" className="h-3.5 w-3.5 shrink-0" />Next: {next}</div> : null}
      {showOwner ? <div className="tnum mt-2 text-[11px] text-muted">Submitted {formatIST(t.submitted_at)}</div> : null}
    </Link>
  );
}
