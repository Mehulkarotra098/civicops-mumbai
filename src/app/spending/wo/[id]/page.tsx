import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, withSystem } from '@/lib/db';
import { BUDGET_PERIOD, NORMAL_BAND_MAX } from '@/lib/history';
import { loadPublic, publicCases, isOverdue, responsibleFor, MONEY_TYPES } from '@/lib/spending';
import { STATUS_PUBLIC, QUESTION_TYPES } from '@/lib/cases';
import { getLocale } from '@/lib/locale';
import { t } from '@/i18n';
import { formatIST, inr } from '@/lib/time';
import { SyntheticNote } from '@/components/ui';
import { Icon } from '@/components/icons';
import { AskForm } from './AskForm';

export const dynamic = 'force-dynamic';

const FLAG_TITLE: Record<string, string> = {
  over_rate: 'Charge above the rate-card estimate, no approved cost revision on record', double_billing: 'Possible duplicate invoice', dlp_paid: 'Charged on work that may be covered by defect liability',
  over_budget: 'Billed above the applicable approved budget', incomplete_evidence: 'Incomplete evidence', reopened: 'Repair reopened within 30 days', sla_missed: 'Time target missed (context)',
};

export default async function WorkOrderPublic({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const locale = await getLocale();
  const d = await withSystem(async (q) => {
    const { h, loc } = await loadPublic(q);
    const wo = h.wos.find((w) => w.work_order_id === id);
    if (!wo) return null;
    const ward = (await q.query<{ office_name: string; budget_inr_2025: number; ward_name: string }>('select office_name, budget_inr_2025::float8 as budget_inr_2025, ward_name from wards where ward_code = $1', [wo.ward_code])).rows[0];
    const complaints = (await q.query<{ complaint_id: string; received_at: Date; description: string; language: string; locality_text: string }>('select complaint_id, received_at, description, language, locality_text from hist_complaints where complaint_id = any($1) order by received_at', [wo.complaints])).rows;
    return { wo, ward, complaints, loc: loc.get(id), flags: h.flags.filter((f) => f.work_order_id === id), cases: await publicCases(q, 'c.work_order_id = $1', [id]) };
  }, await getDb());
  if (!d) notFound();
  const { wo, ward, flags, cases } = d;
  const resp = responsibleFor(wo);
  const money = flags.filter((f) => MONEY_TYPES.includes(f.type));
  const context = flags.filter((f) => ['reopened', 'incomplete_evidence'].includes(f.type));
  const Q = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
    <section className="card p-5" aria-labelledby={`q${n}`}>
      <h2 id={`q${n}`} className="flex items-center gap-2 text-lg font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy-900 text-sm text-white">{n}</span>{title}</h2>
      <div className="mt-3 text-sm">{children}</div>
    </section>
  );
  const Field = ({ k, v, src }: { k: string; v: React.ReactNode; src?: string }) => (
    <div><dt className="kicker">{k}</dt><dd className="mt-0.5">{v}</dd>{src ? <dd className="text-[11px] text-muted">{t(locale, 'f.source')}: {src}</dd> : null}</div>
  );
  const UNAV = <span className="text-muted">{t(locale, 'f.unavailable')}</span>;

  return (
    <div className="space-y-5">
      <nav className="text-xs text-muted"><Link className="underline" href="/spending">{t(locale, 'spend.title')}</Link> › <Link className="underline" href={`/spending/ward/${encodeURIComponent(wo.ward_code)}`}>Ward {wo.ward_code}</Link> › {wo.work_order_id}</nav>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Public work-order record · synthetic source data</div>
          <h1 className="h1 mt-1">{wo.work_order_id} · {wo.road?.road_name} (segment {wo.road?.segment_no}){d.loc ? `, ${d.loc}` : ''}</h1>
          <p className="mt-1 text-sm text-muted">Ward {wo.ward_code} · {wo.work_type} · {wo.contractor_name}</p>
        </div>
        <a href="#ask" className="btn-primary"><Icon name="info" />{t(locale, 'ask.title')}</a>
      </header>
      <SyntheticNote>Source records are synthetic (hackathon dataset). Payment, award and approver records are not in the dataset, so they show as Unavailable. Anything seeded for the walkthrough is labelled “Demo example”.</SyntheticNote>

      <Q n={1} title={t(locale, 'q.approved')}>
        <dl className="grid gap-3 sm:grid-cols-4">
          <Field k="Ward budget (original)" v={<Link className="underline" href={`/spending/ward/${encodeURIComponent(wo.ward_code)}`}>{inr(ward.budget_inr_2025)}</Link>} src="wards.csv" />
          <Field k="Approved revisions" v="None on record" />
          <Field k="Authorizing office" v={ward.office_name} src="wards.csv" />
          <Field k="Budget period" v={BUDGET_PERIOD.label} />
        </dl>
      </Q>
      <Q n={2} title={t(locale, 'q.used')}>
        <dl className="grid gap-3 sm:grid-cols-4">
          <Field k="Purpose" v={`${wo.work_type} repair`} src="work_orders.csv work_type" />
          <Field k="Location" v={`${wo.road?.road_name} segment ${wo.road?.segment_no} (${wo.road_id})${d.loc ? `, ${d.loc}` : ''}`} src="roads.csv" />
          <Field k="Department" v={resp.responsible_office} />
          <Field k="Scope of work" v={`${wo.repair_method}, ${wo.area_sqm} m²`} src="work_orders.csv" />
        </dl>
        {d.complaints.length ? <p className="mt-3 text-xs text-muted">Raised by complaint{d.complaints.length > 1 ? 's' : ''}: {d.complaints.map((c) => <span key={c.complaint_id}><Link className="font-mono underline" href={`/accountability/complaints/${c.complaint_id}`}>{c.complaint_id}</Link> “{c.description.slice(0, 80)}” </span>)}</p> : <p className="mt-3 text-xs text-crit">No complaint is linked to this work order.</p>}
      </Q>
      <Q n={3} title={t(locale, 'q.contract')}>
        <dl className="grid gap-3 sm:grid-cols-4">
          <Field k="Contractor" v={<Link className="underline" href={`/accountability/contractors/${wo.contractor_id}`}>{wo.contractor_name}</Link>} src="contractors.csv (fictional)" />
          <Field k="Awarded amount" v={UNAV} />
          <Field k="Recorded approver" v={UNAV} />
          <Field k="Work order issued" v={formatIST(wo.assigned_at)} src="work_orders.csv assigned_at" />
        </dl>
      </Q>
      <Q n={4} title={t(locale, 'q.billed')}>
        <dl className="grid gap-3 sm:grid-cols-4">
          <Field k={t(locale, 'f.committed')} v={UNAV} />
          <Field k={t(locale, 'f.billed')} v={<b className="text-lg" data-testid="billed">{inr(wo.cost_inr)}</b>} src="work_orders.csv cost_inr" />
          <Field k={t(locale, 'f.paid')} v={UNAV} src="no payment record" />
          <Field k="Rate-card estimate" v={<b className="text-lg" data-testid="reference">{inr(wo.expected_cost)}</b>} src={`rate_card.csv: ${wo.unit === 'per sqm' ? `${wo.area_sqm} m² × ${inr(wo.rate)}` : `${inr(wo.rate)} per job`}`} />
        </dl>
      </Q>
      <Q n={5} title={t(locale, 'q.done')}>
        <dl className="grid gap-3 sm:grid-cols-4">
          <Field k="Completion date" v={formatIST(wo.completed_at)} src="work_orders.csv" />
          <Field k="Published evidence" v={wo.engineer_remark ? <>Engineer remark only: “{wo.engineer_remark}”. No photos published.</> : <span className="text-crit">None on record</span>} />
          <Field k="Verification status" v={UNAV} />
          <Field k="Did it hold?" v={wo.reopened_within_30d ? <span className="font-semibold text-crit">Reopened within 30 days</span> : 'No reopening recorded'} src="work_orders.csv reopened_within_30d" />
        </dl>
        <p className="mt-2 text-xs text-muted">Historical time target: {wo.sla_hours} h, recorded as <b>{wo.sla_met ? 'met' : 'missed'}</b>{wo.hours_first_complaint_to_completion != null ? ` (${wo.hours_first_complaint_to_completion.toFixed(1)} h from first complaint to completion)` : ''}. <Link className="underline" href={`/accountability/work-orders/${wo.work_order_id}`}>Full audit trace</Link></p>
      </Q>
      <Q n={6} title={t(locale, 'q.questioned')}>
        {money.length || context.length ? (
          <div className="space-y-3">
            {[...money, ...context].map((f) => {
              const e = f.evidence as Record<string, number>;
              return (
                <div key={f.type} className={`rounded-lg border p-3 ${money.includes(f) ? 'border-red-200 bg-crit-soft' : 'border-line bg-gray-50'}`} data-testid={`flag-${f.type}`}>
                  <div className="font-semibold">Question for review: {FLAG_TITLE[f.type]}</div>
                  {f.type === 'over_rate' ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
                      <div><div className="kicker">Amount billed</div><div className="font-bold">{inr(e.cost)}</div></div>
                      <div><div className="kicker">Baseline (rate card)</div><div className="font-bold">{inr(e.expected)}</div><div className="text-xs">{wo.area_sqm} m² × {inr(wo.rate)}</div></div>
                      <div><div className="kicker">Difference</div><div className="font-bold" data-testid="difference">{inr(e.difference)}</div><div className="text-xs">{(e.pct_above).toFixed(1)}% above the estimate</div></div>
                      <div><div className="kicker">Under review</div><div className="font-bold">{inr(f.amount_at_issue)}</div><div className="text-xs">above the {NORMAL_BAND_MAX}× normal band</div></div>
                    </div>
                  ) : f.type === 'over_budget' ? (
                    <p className="mt-1">Ward spend before this bill: {inr(e.spend_before)}; after: {inr(e.spend_after)}; approved budget {inr(e.budget)}. Amount under review: <b>{inr(f.amount_at_issue)}</b>.</p>
                  ) : money.includes(f) ? <p className="mt-1">Amount under review: <b>{inr(f.amount_at_issue)}</b>.</p> : null}
                  <p className="mt-1 text-sm">{f.reason}</p>
                  <p className="text-xs text-muted">{t(locale, 'f.source')}: work_orders.csv {wo.work_order_id}{f.type === 'over_rate' ? ', rate_card.csv' : f.type === 'over_budget' ? ', wards.csv' : f.type === 'dlp_paid' ? `, roads.csv ${wo.road_id}` : ''}. This is a question, not a finding.</p>
                </div>
              );
            })}
          </div>
        ) : <p>No review flags on this work order.</p>}
        <h3 className="mt-5 font-semibold">Accountability cases</h3>
        {cases.length ? (
          <ul className="mt-2 space-y-2">{cases.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
              <div>
                <Link className="font-mono font-semibold text-action underline" href={`/spending/case/${c.ref}`}>{c.ref}</Link>
                <span className="ml-2 text-sm">{c.kind === 'question' ? `Resident question: ${QUESTION_TYPES[c.question_type ?? 'other']}` : FLAG_TITLE[c.flag_type ?? ''] ?? c.flag_type}</span>
                {c.is_demo_example ? <span className="chip ml-2 border-amber-300 bg-amber-50 text-amber-900">Demo example</span> : null}
                <div className="text-xs text-muted">Responsible: {c.responsible_office} · response due {formatIST(c.response_due_at)}</div>
              </div>
              <span className={`chip ${isOverdue(c) ? 'border-red-300 bg-crit-soft text-crit' : ['justified', 'corrected'].includes(c.status) ? 'border-green-200 bg-ok-soft text-ok' : 'border-gray-300 text-gray-700'}`}>{isOverdue(c) ? t(locale, 'case.overdue') : STATUS_PUBLIC[c.status]}</span>
            </li>
          ))}</ul>
        ) : <p className="text-muted">No cases yet.</p>}
      </Q>
      <section id="ask" className="card p-5">
        <h2 className="h2">{t(locale, 'ask.title')}</h2>
        <p className="mt-1 text-sm text-muted">Your question goes to {resp.responsible_office}, which must publish a written answer. An independent reviewer then decides. Your name and contact stay private; only a redacted copy of your question is published.</p>
        <AskForm workOrderId={wo.work_order_id} types={QUESTION_TYPES} />
      </section>
    </div>
  );
}
