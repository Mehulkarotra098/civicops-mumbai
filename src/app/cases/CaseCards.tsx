// Expense questions as cards: amount, reason, responsible office, response deadline and decision first.
// The full records table stays one tap away behind a toggle.
import Link from 'next/link';
import type { PublicCase } from '@/lib/spending';
import { isOverdue } from '@/lib/spending';
import { STATUS_PUBLIC } from '@/lib/cases';
import { formatIST, inr } from '@/lib/time';
import { Meter } from '@/components/ui';
import { Icon } from '@/components/icons';
import { CaseTable } from '@/components/CaseTable';

function left(ms: number) {
  const neg = ms < 0;
  let m = Math.abs(Math.round(ms / 60000));
  const d = Math.floor(m / 1440); m -= d * 1440;
  const h = Math.floor(m / 60); m -= h * 60;
  const s = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return neg ? `${s} overdue` : `${s} left`;
}

const DECIDED: Record<string, { cls: string; icon: string }> = {
  justified: { cls: 'border-green-200 bg-ok-soft text-ok', icon: 'checkCircle' },
  corrected: { cls: 'border-green-200 bg-ok-soft text-ok', icon: 'checkCircle' },
  correction_required: { cls: 'border-red-200 bg-crit-soft text-crit', icon: 'alert' },
  needs_evidence: { cls: 'border-med-edge bg-med-soft text-med', icon: 'camera' },
  referred: { cls: 'border-gray-300 bg-gray-50 text-gray-700', icon: 'transfer' },
};

export function CaseCards({ cases, empty, now, limit = 9 }: { cases: PublicCase[]; empty: string; now: Date; limit?: number }) {
  if (!cases.length) return <p className="card flex items-center gap-2 p-5 text-sm text-muted"><Icon name="checkCircle" className="h-5 w-5 text-ok" />{empty}</p>;
  return (
    <>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cases.slice(0, limit).map((c) => {
          const od = isOverdue(c, now);
          const due = new Date(c.response_due_at).getTime();
          const start = new Date(c.created_at).getTime();
          const used = due > start ? Math.round(((now.getTime() - start) / (due - start)) * 100) : 100;
          const awaiting = ['awaiting_response', 'needs_evidence', 'correction_required'].includes(c.status);
          const reason = c.public_question ?? (c.flag_type ? `Flagged: ${c.flag_type.replace(/_/g, ' ')}` : 'Expense question');
          const dec = c.decision ? DECIDED[c.decision] ?? DECIDED.referred : null;
          return (
            <li key={c.id} className={`card flex flex-col p-4 ${od ? 'border-red-300' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/spending/case/${c.ref}`} className="tnum font-mono text-sm font-bold text-action underline">{c.ref}</Link>
                <span className={`chip ${od ? 'border-red-300 bg-crit-soft text-crit' : ['justified', 'corrected'].includes(c.status) ? 'border-green-200 bg-ok-soft text-ok' : 'border-gray-300 bg-white text-gray-700'}`}>
                  <Icon name={od ? 'alert' : ['justified', 'corrected'].includes(c.status) ? 'checkCircle' : 'circle'} className="h-3.5 w-3.5" />{od ? 'Response overdue' : STATUS_PUBLIC[c.status] ?? c.status}
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="tnum text-2xl font-extrabold tracking-tight text-amber-700">{c.amount_under_review ? inr(c.amount_under_review) : '—'}</span>
                <span className="text-xs text-muted">under review</span>
              </div>
              <p className="mt-1 line-clamp-3 text-sm">{reason}</p>
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex items-start gap-1.5"><Icon name="user" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-action" /><span><span className="text-muted">Must answer: </span><b>{c.responsible_office}</b></span></div>
                <div className="flex items-start gap-1.5"><Icon name="rupee" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-action" /><span><span className="text-muted">Work order </span><Link className="font-mono underline" href={`/spending/wo/${c.work_order_id}`}>{c.work_order_id}</Link> · Ward {c.ward_code}</span></div>
              </div>
              <div className="mt-auto pt-3">
                {awaiting ? (
                  <div className={`rounded-lg border px-3 py-2 ${od ? 'border-red-300 bg-crit-soft text-crit' : used >= 80 ? 'border-med-edge bg-med-soft text-med' : 'border-slate-300 bg-white text-ink'}`}>
                    <div className="tnum flex items-center gap-1.5 text-sm font-semibold"><Icon name={od ? 'alert' : 'clock'} />Response · {left(due - now.getTime())}</div>
                    <div className="tnum text-xs">Due {formatIST(c.response_due_at)}</div>
                    <div className="mt-1.5"><Meter pct={used} tone={od ? 'crit' : used >= 80 ? 'med' : 'action'} label={`${Math.min(used, 999)}% of the response window used`} className="h-1.5" /></div>
                  </div>
                ) : (
                  <div className="tnum rounded-lg border border-line bg-gray-50 px-3 py-2 text-xs text-muted">Response was due {formatIST(c.response_due_at)}{c.responses ? ` · ${c.responses} response${c.responses === 1 ? '' : 's'} published` : ''}</div>
                )}
                {dec ? <div className={`mt-2 flex items-start gap-1.5 rounded-lg border px-3 py-2 text-xs ${dec.cls}`}><Icon name={dec.icon} className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><b className="capitalize">Decision: {c.decision!.replace(/_/g, ' ')}</b>{c.decision_reason ? <span className="block text-ink">{c.decision_reason}</span> : null}</span></div> : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.escalated_at ? <span className="chip border-red-300 bg-crit-soft text-crit"><Icon name="alert" className="h-3 w-3" />Escalated to oversight</span> : null}
                  {c.is_demo_example ? <span className="chip border-amber-300 bg-amber-50 text-amber-900">Demo example</span> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <details className="mt-3 rounded-xl border border-line bg-white">
        <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-2 px-3 text-sm font-semibold">{cases.length > limit ? <>Show all {cases.length} records<span className="font-normal text-muted">(cards show the first {limit})</span></> : 'Show records table'}</summary>
        <div className="border-t border-line p-2"><CaseTable cases={cases} empty={empty} /></div>
      </details>
    </>
  );
}
