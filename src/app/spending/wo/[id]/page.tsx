import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, withSystem } from '@/lib/db';
import { BUDGET_PERIOD, NORMAL_BAND_MAX } from '@/lib/history';
import { loadPublic, publicCases, isOverdue, responsibleFor, MONEY_TYPES } from '@/lib/spending';
import { STATUS_PUBLIC, QUESTION_TYPES } from '@/lib/cases';
import { getLocale } from '@/lib/locale';
import { t } from '@/i18n';
import { formatIST, formatDateIST, inr } from '@/lib/time';
import { SyntheticNote } from '@/components/ui';
import { Icon } from '@/components/icons';
import { AskForm } from './AskForm';
import { BandBar } from '@/components/charts/BandBar';
import { TrailLine } from '@/components/charts/TrailLine';
import { Legend } from '@/components/charts/ChartCard';

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
      <h2 id={`q${n}`} className="flex items-center gap-2 text-lg font-bold tracking-tight"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-action text-sm text-white tnum">{n}</span>{title}</h2>
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
          <div className="kicker">Public work-order record · {wo.data_origin && wo.data_origin !== 'synthetic_repo' ? <span className="chip border-teal-300 bg-teal-50 text-teal-800">Live data ({wo.data_origin === 'live_upload' ? 'uploaded' : 'entered'} in the app)</span> : 'synthetic source data'}</div>
          <h1 className="h1 mt-1">{wo.work_order_id} · {wo.road?.road_name} (segment {wo.road?.segment_no}){d.loc ? `, ${d.loc}` : ''}</h1>
          <p className="mt-1 text-sm text-muted">Ward {wo.ward_code} · {wo.work_type} · {wo.contractor_name}</p>
        </div>
        <a href="#ask" className="btn-primary"><span className="inline-flex items-center gap-2 text-white"><Icon name="info" />{t(locale, 'ask.title')}</span></a>
      </header>
      <SyntheticNote>Source records are synthetic (hackathon dataset). Payment, award and approver records are not in the dataset, so they show as Unavailable. Anything seeded for the walkthrough is labelled “Demo example”.</SyntheticNote>


      {/* Focal: the bill against its rate card and normal band, then the money trail */}
      <section className="card overflow-hidden" aria-labelledby="glance-h">
        {(() => {
          const band = wo.expected_cost * NORMAL_BAND_MAX;
          const above = wo.cost_inr > band;
          const reviewState = cases.length || money.length ? 'crit' : 'done';
          return (
            <>
              <div className={`grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-center ${above ? 'bg-linear-to-br from-crit-soft to-white' : 'bg-linear-to-br from-ok-soft to-white'}`}>
                <div>
                  <h2 id="glance-h" className="kicker">The bill at a glance</h2>
                  <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-3">
                    <div><div className="text-xs font-semibold text-muted">{t(locale, 'f.billed')}</div><div className={`text-4xl font-extrabold tracking-tight tnum ${above ? 'text-crit' : 'text-ok'}`} data-testid="billed">{inr(wo.cost_inr)}</div></div>
                    <div><div className="text-xs font-semibold text-muted">Rate-card estimate</div><div className="text-2xl font-extrabold text-action tnum" data-testid="reference">{inr(wo.expected_cost)}</div></div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`chip ${above ? 'border-red-200 bg-white text-crit' : 'border-green-200 bg-white text-ok'}`}><Icon name={above ? 'alert' : 'checkCircle'} className="h-3.5 w-3.5" /><span className="tnum">{wo.cost_ratio.toFixed(2)}× the rate card</span></span>
                    <span className={`chip ${above ? 'border-red-200 bg-white text-crit' : 'border-green-200 bg-white text-ok'}`}><span className="tnum">{above ? `${inr(wo.cost_inr - band)} above the ${NORMAL_BAND_MAX}× band` : `Within the ${NORMAL_BAND_MAX}× band`}</span></span>
                    <span className="chip border-gray-300 bg-white text-muted">{t(locale, 'f.paid')}: {t(locale, 'f.unavailable')}</span>
                  </div>
                </div>
                <div className="min-w-0 rounded-2xl border border-line bg-white p-4 sm:p-5">
                  <BandBar billed={wo.cost_inr} reference={wo.expected_cost} bandMax={NORMAL_BAND_MAX} />
                  <div className="mt-3"><Legend items={[{ label: `Normal band (1.0× to ${NORMAL_BAND_MAX}× the rate card)`, swatch: 'bg-action-soft' }, { label: above ? 'Bill, above the band' : 'Bill, within the band', swatch: above ? 'bg-crit' : 'bg-ok' }]} /></div>
                  <p className="mt-2 text-[11px] text-muted tnum">Reference: {wo.unit === 'per sqm' ? `${wo.area_sqm} m² × ${inr(wo.rate)}` : `${inr(wo.rate)} per job`} ({wo.repair_method}) · Source: work_orders.csv, rate_card.csv</p>
                </div>
              </div>
              <div className="border-t border-line p-5 sm:p-6">
                <div className="kicker mb-3 text-action">The money trail for this work order</div>
                <TrailLine label="Money trail" steps={[
                  { key: 'b', label: 'Approved budget', value: inr(ward.budget_inr_2025), sub: `Ward ${wo.ward_code} · no revisions on record`, state: 'done', href: `/spending/ward/${encodeURIComponent(wo.ward_code)}` },
                  { key: 'w', label: 'Work order', value: formatDateIST(wo.assigned_at), sub: d.complaints[0] ? `After complaint ${d.complaints[0].complaint_id}` : 'No complaint linked', state: d.complaints[0] ? 'done' : 'warn' },
                  { key: 'bill', label: 'Bill', value: inr(wo.cost_inr), sub: `Paid: ${t(locale, 'f.unavailable')}`, state: above ? 'crit' : 'done' },
                  { key: 'e', label: 'Evidence', value: wo.engineer_remark ? 'Remark only' : 'None on record', sub: wo.reopened_within_30d ? 'Repair reopened within 30 days' : 'Held 30 days', state: !wo.engineer_remark || wo.reopened_within_30d ? 'warn' : 'done' },
                  { key: 'r', label: 'Review', value: cases.length ? `${cases.length} case${cases.length > 1 ? 's' : ''}` : money.length ? `${money.length} flag${money.length > 1 ? 's' : ''}` : 'No questions', sub: cases.length ? (cases.some((c) => isOverdue(c)) ? 'A response is overdue' : 'Waiting on the office or reviewer') : 'Ask below', state: reviewState, href: cases.length ? `/spending/case/${cases[0].ref}` : '#ask' },
                ]} />
              </div>
            </>
          );
        })()}
      </section>
      <Q n={1} title={t(locale, 'q.approved')}>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field k="Ward budget (original)" v={<Link className="underline" href={`/spending/ward/${encodeURIComponent(wo.ward_code)}`}>{inr(ward.budget_inr_2025)}</Link>} src="wards.csv" />
          <Field k="Approved revisions" v="None on record" />
          <Field k="Authorizing office" v={ward.office_name} src="wards.csv" />
          <Field k="Budget period" v={BUDGET_PERIOD.label} />
        </dl>
      </Q>
      <Q n={2} title={t(locale, 'q.used')}>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field k="Purpose" v={`${wo.work_type} repair`} src="work_orders.csv work_type" />
          <Field k="Location" v={`${wo.road?.road_name} segment ${wo.road?.segment_no} (${wo.road_id})${d.loc ? `, ${d.loc}` : ''}`} src="roads.csv" />
          <Field k="Department" v={resp.responsible_office} />
          <Field k="Scope of work" v={`${wo.repair_method}, ${wo.area_sqm} m²`} src="work_orders.csv" />
        </dl>
        {d.complaints.length ? <p className="mt-3 text-xs text-muted">Raised by complaint{d.complaints.length > 1 ? 's' : ''}: {d.complaints.map((c) => <span key={c.complaint_id}><Link className="font-mono underline" href={`/accountability/complaints/${c.complaint_id}`}>{c.complaint_id}</Link> “{c.description.slice(0, 80)}” </span>)}</p> : <p className="mt-3 text-xs text-crit">No complaint is linked to this work order.</p>}
      </Q>
      <Q n={3} title={t(locale, 'q.contract')}>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field k="Contractor" v={<Link className="underline" href={`/accountability/contractors/${wo.contractor_id}`}>{wo.contractor_name}</Link>} src="contractors.csv (fictional)" />
          <Field k="Awarded amount" v={UNAV} />
          <Field k="Recorded approver" v={UNAV} />
          <Field k="Work order issued" v={formatIST(wo.assigned_at)} src="work_orders.csv assigned_at" />
        </dl>
      </Q>
      <Q n={4} title={t(locale, 'q.billed')}>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field k={t(locale, 'f.committed')} v={UNAV} />
          <Field k={t(locale, 'f.billed')} v={<b className="text-lg tnum">{inr(wo.cost_inr)}</b>} src="work_orders.csv cost_inr" />
          <Field k={t(locale, 'f.paid')} v={UNAV} src="no payment record" />
          <Field k="Rate-card estimate" v={<b className="text-lg tnum">{inr(wo.expected_cost)}</b>} src={`rate_card.csv: ${wo.unit === 'per sqm' ? `${wo.area_sqm} m² × ${inr(wo.rate)}` : `${inr(wo.rate)} per job`}`} />
        </dl>
      </Q>
      <Q n={5} title={t(locale, 'q.done')}>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                <Link className="font-mono font-semibold text-action! underline" href={`/spending/case/${c.ref}`}>{c.ref}</Link>
                <span className="ml-2 text-sm">{c.kind === 'question' ? `Resident question: ${QUESTION_TYPES[c.question_type ?? 'other']}` : FLAG_TITLE[c.flag_type ?? ''] ?? c.flag_type}</span>
                {c.is_demo_example ? <span className="chip ml-2 border-amber-300 bg-amber-50 text-amber-900">Demo example</span> : null}
                <div className="text-xs text-muted">Responsible: {c.responsible_office} · response due {formatIST(c.response_due_at)}</div>
              </div>
              <span className={`chip ${isOverdue(c) ? 'border-red-300 bg-crit-soft text-crit' : ['justified', 'corrected'].includes(c.status) ? 'border-green-200 bg-ok-soft text-ok' : 'border-gray-300 text-gray-700'}`}>{isOverdue(c) ? t(locale, 'case.overdue') : STATUS_PUBLIC[c.status]}</span>
            </li>
          ))}</ul>
        ) : <p className="text-muted">No cases yet.</p>}
      </Q>
      <section id="ask" className="card scroll-mt-20 border-action/40 bg-linear-to-br from-action-soft/50 to-white p-5 sm:p-6">
        <h2 className="h2">{t(locale, 'ask.title')}</h2>
        <p className="mt-1 text-sm text-muted">Your question goes to {resp.responsible_office}, which must publish a written answer. An independent reviewer then decides. Your name and contact stay private; only a redacted copy of your question is published.</p>
        <AskForm workOrderId={wo.work_order_id} types={QUESTION_TYPES} />
      </section>
    </div>
  );
}
