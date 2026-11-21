import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, withSystem } from '@/lib/db';
import { publicCases, isOverdue } from '@/lib/spending';
import { STATUS_PUBLIC, QUESTION_TYPES, FLAG_QUESTION } from '@/lib/cases';
import { currentUser } from '@/lib/session';
import { getLocale } from '@/lib/locale';
import { t } from '@/i18n';
import { formatIST, formatDateIST, inr } from '@/lib/time';
import { SyntheticNote } from '@/components/ui';
import { Icon } from '@/components/icons';
import { CaseActions } from '@/components/CaseActions';
import { Countdown } from '@/components/charts/Countdown';
import { TrailLine, type TrailStep } from '@/components/charts/TrailLine';

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
  const calc = (c.calculation ?? {}) as { billed?: number; reference?: number };
  const corrected = c.status === 'corrected' || c.status === 'closed';
  const steps: TrailStep[] = [
    { key: 'sub', label: 'Submitted', value: formatDateIST(c.created_at), sub: c.kind === 'question' ? 'Resident question' : 'Audit flag', state: 'done' },
    { key: 'due', label: 'Response due', value: formatDateIST(c.response_due_at), sub: overdue ? 'Deadline missed' : responses.length ? 'Answer received' : 'Clock running', state: overdue ? 'crit' : responses.length || closed ? 'done' : 'current' },
    ...(c.escalated_at ? [{ key: 'esc', label: 'Escalated', value: formatDateIST(c.escalated_at), sub: 'Sent to the oversight queue', state: 'crit' as const }] : []),
    { key: 'resp', label: 'Response', value: responses.length ? `${responses.length} published` : 'None yet', sub: responses.length ? responses[responses.length - 1].responder_office : 'Waiting for the office', state: responses.length ? 'done' : 'todo' },
    { key: 'dec', label: 'Independent decision', value: c.decision ? STATUS_PUBLIC[c.status] : 'Not yet', sub: c.decided_at ? formatDateIST(c.decided_at) : c.reviewer_office, state: c.decision ? (['correction_required', 'needs_evidence'].includes(c.status) ? 'warn' : 'done') : c.status === 'awaiting_review' ? 'current' : 'todo' },
    { key: 'cor', label: 'Correction', value: corrected ? 'Done' : c.corrective_action ? (c.corrective_completed_at ? 'Reported done' : 'Still due') : c.status === 'justified' ? 'Not needed' : 'Not yet', sub: c.corrective_due_at ? `Due ${formatDateIST(c.corrective_due_at)}` : undefined, state: corrected ? 'done' : c.corrective_action ? 'current' : c.status === 'justified' ? 'na' : 'todo' },
  ];

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
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="kicker">{c.kind === 'question' ? 'A resident asked' : 'The spending audit asks'}</div>
            <p className="mt-1 text-lg font-bold leading-snug sm:text-xl">{c.public_question ?? (c.flag_type ? FLAG_QUESTION[c.flag_type] : QUESTION_TYPES.other)}</p>
            <p className="mt-1 text-xs text-muted">{c.kind === 'question' ? 'Asked by a resident (identity private; contact details removed)' : 'Raised automatically by the spending audit'} · <span className="tnum">{formatIST(c.created_at)}</span> · about <Link className="font-mono underline" href={`/spending/wo/${c.work_order_id}`}>{c.work_order_id}</Link> · Ward {c.ward_code}</p>
            <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <div className="text-xs font-semibold text-muted">Amount under review</div>
                <div className={`text-4xl font-extrabold tracking-tight tnum ${c.amount_under_review ? 'text-crit' : 'text-muted'}`}>{c.amount_under_review ? inr(c.amount_under_review) : 'Not set'}</div>
              </div>
              {calc.billed ? <div><div className="text-xs font-semibold text-muted">Billed</div><div className="text-xl font-bold tnum">{inr(calc.billed)}</div></div> : null}
              {calc.reference ? <div><div className="text-xs font-semibold text-muted">Rate-card reference</div><div className="text-xl font-bold text-action tnum">{inr(calc.reference)}</div></div> : null}
            </div>
            {c.calculation && Object.keys(c.calculation).length ? (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer py-2 font-semibold text-action">How the amount is worked out</summary>
                <dl className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {Object.entries(c.calculation).filter(([k]) => k !== 'reason').map(([k, v]) => <div key={k} className="rounded-lg border border-line p-2"><dt className="text-muted">{k.replace(/_/g, ' ')}</dt><dd className="font-semibold tnum">{typeof v === 'number' && /billed|reference|difference|over/.test(k) ? inr(v) : typeof v === 'number' ? (Math.round(v * 100) / 100).toLocaleString('en-IN') : String(v ?? 'Unavailable')}</dd></div>)}
                </dl>
              </details>
            ) : null}
          </div>
          <div className="grid content-start gap-3 text-sm">
            <Countdown startIso={new Date(c.created_at).toISOString()} dueIso={new Date(c.response_due_at).toISOString()} dueLabel={formatIST(c.response_due_at)} stopped={responses.length > 0 || closed} stoppedLabel={responses.length ? 'Written response published' : 'Case closed'} />
            <div className="rounded-xl border border-line p-3"><div className="kicker">Responsible office</div><div className="font-bold">{c.responsible_office}</div><div className="text-xs text-muted">{c.responsible_role} · Official name: {c.official_name ?? 'not in an approved public record'}</div></div>
            <div className={`rounded-xl border p-3 ${c.decision ? (closed ? 'border-green-200 bg-ok-soft' : 'border-med-edge bg-med-soft') : 'border-line'}`}>
              <div className="kicker">Independent decision</div>
              <div className="font-bold">{c.decision ? STATUS_PUBLIC[c.status] : 'Not decided yet'}</div>
              <div className="text-xs text-muted">{c.reviewer_office}</div>
            </div>
          </div>
        </div>
        <div className="border-t border-line p-5 sm:p-6">
          <div className="kicker mb-3 text-action">Where this case is</div>
          <TrailLine label="Case lifecycle" steps={steps} />
        </div>
      </header>

      {c.decision ? (
        <section className={`card p-5 ${c.status === 'justified' || c.status === 'corrected' ? 'border-green-200' : 'border-med-edge'}`} aria-labelledby="dec-h">
          <h2 id="dec-h" className="h2">Decision: {STATUS_PUBLIC[c.status]}</h2>
          <p className="mt-2 text-sm">{c.decision_reason}</p>
          <p className="text-xs text-muted">{c.reviewer_office} · {formatIST(c.decided_at)}</p>
          {c.previous_values && c.corrected_values ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-3" data-testid="correction">
              <div className="rounded-lg border border-line p-3"><div className="kicker">Previous bill</div><div className="text-2xl font-extrabold tnum line-through decoration-crit">{inr(c.previous_values.billed)}</div></div>
              <div className="rounded-lg border border-green-200 bg-ok-soft p-3"><div className="kicker">Corrected bill</div><div className="text-2xl font-extrabold text-ok tnum">{inr(c.corrected_values.billed)}</div></div>
              <div className="rounded-lg border border-line p-3"><div className="kicker">To recover</div><div className="text-2xl font-extrabold tnum">{inr(c.corrected_values.recovery)}</div></div>
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
