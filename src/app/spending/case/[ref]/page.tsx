import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, withSystem } from '@/lib/db';
import { publicCases, isOverdue } from '@/lib/spending';
import { STATUS_PUBLIC, QUESTION_TYPES, FLAG_QUESTION } from '@/lib/cases';
import { currentUser } from '@/lib/session';
import { getLocale } from '@/lib/locale';
import { t } from '@/i18n';
import { formatIST, inr } from '@/lib/time';
import { SyntheticNote } from '@/components/ui';
import { Icon } from '@/components/icons';
import { CaseActions } from '@/components/CaseActions';

export const dynamic = 'force-dynamic';

const EVENT_LABEL: Record<string, string> = {
  flag_raised: 'Flag raised', question_asked: 'Resident question received', assigned: 'Assigned to the responsible office', escalated_overdue: 'Response overdue: escalated to oversight',
  response_submitted: 'Written response published', decision_justified: 'Independent review: explanation accepted', decision_correction_required: 'Independent review: correction required',
  decision_referred: 'Independent review: referred for further review', decision_needs_evidence: 'Independent review: more evidence needed', correction_reported: 'Office reports the correction done', closed_corrected: 'Correction verified, case closed',
};

export default async function CasePage({ params }: { params: Promise<{ ref: string }> }) {
  const ref = decodeURIComponent((await params).ref);
  const locale = await getLocale();
  const user = await currentUser();
  const d = await withSystem(async (q) => {
    const c = (await publicCases(q, 'c.ref = $1', [ref]))[0];
    if (!c) return null;
    const responses = (await q.query<{ id: string; version: number; body: string; evidence: { kind: string; reference: string; note: string | null }[]; responder_office: string; created_at: Date }>('select id, version, body, evidence, responder_office, created_at from case_responses where case_id = $1 order by version', [c.id])).rows;
    const events = (await q.query<{ id: number; at: Date; actor_role: string; actor_office: string | null; type: string; note: string | null; data: Record<string, unknown> }>('select id, at, actor_role, actor_office, type, note, data from case_events where case_id = $1 order by at, id', [c.id])).rows;
    const member = user ? (await q.query('select 1 from memberships where user_id = $1 and ward_code = $2', [user.id, c.ward_code])).rows.length > 0 : false;
    return { c, responses, events, member };
  }, await getDb());
  if (!d) notFound();
  const { c, responses, events } = d;
  const overdue = isOverdue(c);
  const closed = ['justified', 'corrected', 'closed'].includes(c.status);
  const canRespond = !!user && ['officer', 'ward_admin'].includes(user.role) && d.member && !closed;
  const canDecide = !!user && ['auditor', 'super_admin'].includes(user.role) && !d.member && !closed;

  return (
    <div className="space-y-5">
      <nav className="text-xs text-muted"><Link className="underline" href="/spending">{t(locale, 'spend.title')}</Link> › <Link className="underline" href={`/spending/wo/${c.work_order_id}`}>{c.work_order_id}</Link> › {c.ref}</nav>
      <header className="card overflow-hidden">
        <div className={`flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 ${overdue ? 'bg-crit-soft' : closed ? 'bg-ok-soft' : 'bg-gray-50'}`}>
          <span className="font-mono text-sm font-bold" data-testid="case-ref">{c.ref}</span>
          <span className={`chip ${overdue ? 'border-red-300 bg-white text-crit' : closed ? 'border-green-200 bg-white text-ok' : 'border-gray-300 bg-white text-gray-700'}`} data-testid="case-status">
            <Icon name={overdue ? 'alert' : closed ? 'checkCircle' : 'clock'} className="h-3.5 w-3.5" />{overdue ? t(locale, 'case.overdue') : STATUS_PUBLIC[c.status]}
          </span>
          {c.escalated_at ? <span className="chip border-red-300 bg-white text-crit">Escalated to oversight {formatIST(c.escalated_at)}</span> : null}
          {c.is_demo_example ? <span className="chip border-amber-300 bg-amber-50 text-amber-900">Demo example: seeded response and outcome</span> : null}
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div>
            <div className="kicker">Question</div>
            <p className="mt-1 text-base font-semibold">{c.public_question ?? (c.flag_type ? FLAG_QUESTION[c.flag_type] : QUESTION_TYPES.other)}</p>
            <p className="mt-1 text-xs text-muted">{c.kind === 'question' ? 'Asked by a resident (identity private; contact details removed)' : 'Raised automatically by the spending audit'} · {formatIST(c.created_at)} · about <Link className="font-mono underline" href={`/spending/wo/${c.work_order_id}`}>{c.work_order_id}</Link></p>
            {c.amount_under_review ? <p className="mt-3 text-sm">Amount under review: <b>{inr(c.amount_under_review)}</b></p> : null}
            {c.calculation && Object.keys(c.calculation).length ? (
              <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                {Object.entries(c.calculation).filter(([k]) => k !== 'reason').map(([k, v]) => <div key={k}><dt className="text-muted">{k.replace(/_/g, ' ')}</dt><dd className="font-medium">{typeof v === 'number' && /billed|reference|difference|over/.test(k) ? inr(v) : String(v ?? 'Unavailable')}</dd></div>)}
              </dl>
            ) : null}
          </div>
          <dl className="grid content-start gap-3 text-sm">
            <div><dt className="kicker">Responsible office</dt><dd className="font-semibold">{c.responsible_office}</dd><dd className="text-xs text-muted">{c.responsible_role} · Official name: {c.official_name ?? 'not in an approved public record'}</dd></div>
            <div><dt className="kicker">Written response due</dt><dd className={overdue ? 'font-semibold text-crit' : ''}>{formatIST(c.response_due_at)}{overdue ? ' (overdue)' : ''}</dd></div>
            <div><dt className="kicker">Independent reviewer</dt><dd>{c.reviewer_office}</dd></div>
          </dl>
        </div>
      </header>

      {c.decision ? (
        <section className={`card p-5 ${c.status === 'justified' || c.status === 'corrected' ? 'border-green-200' : 'border-med-edge'}`} aria-labelledby="dec-h">
          <h2 id="dec-h" className="h2">Decision: {STATUS_PUBLIC[c.status]}</h2>
          <p className="mt-2 text-sm">{c.decision_reason}</p>
          <p className="text-xs text-muted">{c.reviewer_office} · {formatIST(c.decided_at)}</p>
          {c.previous_values && c.corrected_values ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-3" data-testid="correction">
              <div className="rounded-lg border border-line p-3"><div className="kicker">Previous bill</div><div className="text-lg font-bold line-through decoration-crit">{inr(c.previous_values.billed)}</div></div>
              <div className="rounded-lg border border-green-200 bg-ok-soft p-3"><div className="kicker">Corrected bill</div><div className="text-lg font-bold">{inr(c.corrected_values.billed)}</div></div>
              <div className="rounded-lg border border-line p-3"><div className="kicker">To recover</div><div className="text-lg font-bold">{inr(c.corrected_values.recovery)}</div></div>
            </div>
          ) : null}
          {c.corrective_action ? (
            <div className="mt-3 rounded-lg border border-line p-3 text-sm">
              <b>Follow-up:</b> {c.corrective_action}. Owner: {c.corrective_owner}. Due {formatIST(c.corrective_due_at)}. Status: <b>{c.status === 'corrected' ? 'completed and verified' : c.corrective_completed_at ? `reported done ${formatIST(c.corrective_completed_at)}, awaiting verification` : 'still due'}</b>.
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="card p-5" aria-labelledby="resp-h">
        <h2 id="resp-h" className="h2">Written responses ({responses.length})</h2>
        {responses.length ? responses.map((r) => (
          <div key={r.id} className="mt-3 rounded-lg border border-line p-3 text-sm">
            <div className="text-xs text-muted">Version {r.version} · {r.responder_office} · {formatIST(r.created_at)}</div>
            <p className="mt-1">{r.body}</p>
            {r.evidence.length ? <ul className="mt-2 list-disc pl-5 text-xs">{r.evidence.map((e, i) => <li key={i}><b>{e.kind}:</b> {e.reference}{e.note ? ` (${e.note})` : ''}</li>)}</ul> : <p className="mt-1 text-xs text-muted">No supporting records attached.</p>}
          </div>
        )) : <p className="mt-2 text-sm text-muted">{overdue ? 'No response was received by the deadline. The case is in the oversight queue and stays marked “Response overdue” until the office replies.' : 'Waiting for the responsible office.'}</p>}
      </section>

      {canRespond || canDecide ? <CaseActions caseId={c.id} mode={canDecide ? 'review' : 'respond'} status={c.status} billed={Number((c.calculation as { billed?: number }).billed ?? 0)} reference={Number((c.calculation as { reference?: number }).reference ?? 0)} correctionOpen={c.status === 'correction_required'} /> : null}

      <section className="card p-5" aria-labelledby="hist-h">
        <h2 id="hist-h" className="h2">Decision history</h2>
        <ol className="mt-3 space-y-3 border-l-2 border-line pl-5">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span className={`absolute -left-[27px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white ${e.type.startsWith('escalated') ? 'bg-crit' : e.type.startsWith('decision') || e.type.startsWith('closed') ? 'bg-ok' : 'bg-action'}`} aria-hidden />
              <div className="text-sm font-semibold">{EVENT_LABEL[e.type] ?? e.type}</div>
              <div className="text-xs text-muted">{formatIST(e.at)} · {e.actor_office ?? e.actor_role}</div>
              {e.note ? <p className="text-sm">{e.note}</p> : null}
            </li>
          ))}
        </ol>
      </section>
      <SyntheticNote>Expense records are synthetic. Office responses and audit outcomes marked “Demo example” were seeded for the walkthrough; all others were entered in this app.</SyntheticNote>
    </div>
  );
}
