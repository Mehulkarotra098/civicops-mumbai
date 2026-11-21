import Link from 'next/link';
import type { TicketRow } from '@/lib/tickets';
import { activeClock } from '@/lib/sla';
import { formatIST } from '@/lib/time';
import { CategoryIcon, PriorityBadge, StatusBadge } from './ui';
import { DeadlineClock } from './client';

export function TicketCard({ t, showOwner = true }: { t: TicketRow & { officer_name?: string | null; contractor_name?: string | null }; showOwner?: boolean }) {
  const c = activeClock(t, new Date());
  const resolved = t.status === 'verified_resolved';
  return (
    <Link href={`/tickets/${t.ref}`} className={`card block p-4 hover:border-action ${resolved ? 'border-green-200' : ''}`} data-testid={`ticket-card-${t.ref}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-xs font-bold">{t.ref}</span>
        <StatusBadge status={t.status} />
        <PriorityBadge priority={t.priority} original={t.original_priority} resolved={resolved} />
        {t.escalation_level > 0 && !resolved ? <span className="chip border-red-300 bg-crit-soft text-crit">Escalated</span> : null}
      </div>
      <div className="mt-2 flex items-start gap-2 font-semibold"><CategoryIcon code={t.category_code} className="mt-0.5 h-4 w-4 shrink-0" /><span>{t.title}</span></div>
      {showOwner ? <div className="mt-1 text-xs text-muted">{t.ward_code ? `Ward ${t.ward_code}` : 'Triage'}{t.department_code ? ` · ${t.department_code}` : ''} · submitted {formatIST(t.submitted_at)}</div> : null}
      {showOwner ? <div className="mt-1 text-xs"><span className="text-muted">Assigned to </span><b>{t.officer_name ?? (t.assigned_officer_id ? 'Ward officer' : 'nobody yet')}</b>{t.contractor_name ? <><span className="text-muted"> · contractor </span><b>{t.contractor_name}</b></> : null}</div> : null}
      <div className="mt-3 flex items-center gap-3">
        <div className="flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-gray-200"><div className={`h-full ${t.progress_pct === 100 ? 'bg-ok' : 'bg-action'}`} style={{ width: `${t.progress_pct}%` }} /></div>
          <div className="mt-1 text-xs text-muted">{t.progress_pct}% complete</div>
        </div>
        <div className="w-44 shrink-0"><DeadlineClock compact dueAt={c.dueAt.toISOString()} startedAt={t.clock_started_at.toISOString()} kind={c.kind} stoppedAt={t.sla_stopped_at?.toISOString() ?? null} outcome={t.sla_outcome} dueLabel={formatIST(c.dueAt)} /></div>
      </div>
    </Link>
  );
}
